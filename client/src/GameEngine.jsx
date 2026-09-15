import { useEffect, useRef } from 'react'
import Matter from 'matter-js'

export default function GameEngine({ config, commands, simulationPhase, onTurnEnd, onTragedy }) {
    const canvasRef = useRef(null)
    const engineRef = useRef(null)
    const runnerRef = useRef(null)
    const renderLoopRef = useRef(null)
    const beforeUpdateCallback = useRef(null)

    useEffect(() => {
        if (!config || !canvasRef.current) return;
        
        if (engineRef.current) {
            if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
            cancelAnimationFrame(renderLoopRef.current);
            Matter.Engine.clear(engineRef.current);
        }

        const engine = Matter.Engine.create();
        engineRef.current = engine;
        engine.world.gravity.y = config.gravityY !== undefined ? config.gravityY : 1;
        engine.world.gravity.x = config.gravityX || 0;

        const compositeBodies = config.bodies.map(b => {
            if (b.type === 'rectangle') {
                return Matter.Bodies.rectangle(b.x, b.y, b.w, b.h, { ...b.options, plugin: { w: b.w, h: b.h } });
            } else if (b.type === 'circle') {
                return Matter.Bodies.circle(b.x, b.y, b.r, { ...b.options, plugin: { r: b.r } });
            }
            return null;
        }).filter(Boolean);

        Matter.Composite.add(engine.world, compositeBodies);

        // Custom ASCII Renderer
        const ctx = canvasRef.current.getContext('2d');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const drawASCII = () => {
            // Background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 800, 600);

            // Font
            ctx.font = '900 24px "Helvetica Neue", Helvetica, Arial, sans-serif';

            const bodies = Matter.Composite.allBodies(engine.world);
            
            bodies.forEach(body => {
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                ctx.rotate(body.angle);
                
                let char = '?';
                let color = '#000000';

                if (body.label === 'crown') { char = 'W'; color = '#b8860b'; } // Dark Gold
                else if (body.label === 'dagger') { char = 'V'; color = '#dc2626'; } // Crimson
                else if (body.label === 'wall' || body.label === 'ground' || body.label === 'ceiling') { char = '#'; color = '#000000'; } // Black
                else if (body.label === 'glass') { char = '='; color = '#0ea5e9'; } // Blue
                else if (body.label === 'obstacle') { char = '-'; color = '#78350f'; } // Brown
                else if (body.label === 'debris') { char = '[]'; color = '#ea580c'; } // Orange
                else if (body.label === 'lodestone') { char = '(@)'; color = '#0d9488'; } // Teal

                ctx.shadowBlur = 0;
                ctx.fillStyle = color;
                
                if (body.label === 'wall' || body.label === 'ground' || body.label === 'ceiling' || body.label === 'obstacle' || body.label === 'glass') {
                    const width = body.plugin.w || 20;
                    const height = body.plugin.h || 20;
                    if (height > width) {
                        const charCount = Math.max(1, Math.floor(height / 15));
                        for(let i=0; i<charCount; i++) {
                            const offsetY = -height/2 + (height/charCount)*i + (height/charCount)/2;
                            ctx.fillText(char, 0, offsetY);
                        }
                    } else {
                        const charCount = Math.max(1, Math.floor(width / 15));
                        for(let i=0; i<charCount; i++) {
                            const offsetX = -width/2 + (width/charCount)*i + (width/charCount)/2;
                            ctx.fillText(char, offsetX, 0);
                        }
                    }
                } else if (body.label === 'dagger') {
                    const height = body.plugin.h || 80;
                    const charCount = Math.max(1, Math.floor(height / 15));
                    for(let i=0; i<charCount; i++) {
                        const offsetY = -height/2 + (height/charCount)*i + (height/charCount)/2;
                        const bladeChar = (i === charCount - 1) ? 'V' : '|';
                        ctx.fillText(bladeChar, 0, offsetY);
                    }
                } else {
                    ctx.fillText(char, 0, 0);
                }
                
                ctx.restore();
            });

            renderLoopRef.current = requestAnimationFrame(drawASCII);
        };
        
        drawASCII();

        return () => {
            cancelAnimationFrame(renderLoopRef.current);
            if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
            Matter.Engine.clear(engine);
        };
    }, [config]);

    useEffect(() => {
        if (!simulationPhase || !engineRef.current) return;
        
        const engine = engineRef.current;
        const bodies = Matter.Composite.allBodies(engine.world);
        const dagger = bodies.find(b => b.label === 'dagger');
        const crown = bodies.find(b => b.label === 'crown');
        const lodestones = bodies.filter(b => b.label === 'lodestone');

        if (beforeUpdateCallback.current) {
            Matter.Events.off(engine, 'beforeUpdate', beforeUpdateCallback.current);
        }

        let customForce = null;

        (commands || []).forEach(cmd => {
            if (cmd.action === 'Suspend' && dagger) Matter.Body.setStatic(dagger, true);
            if (cmd.action === 'Invert') engine.world.gravity.y *= -1;
            if (cmd.action === 'Swap' && dagger && crown) {
                const daggerPos = { x: dagger.position.x, y: dagger.position.y };
                const crownPos = { x: crown.position.x, y: crown.position.y };
                Matter.Body.setPosition(dagger, crownPos);
                Matter.Body.setPosition(crown, daggerPos);
                Matter.Body.setVelocity(dagger, { x: 0, y: 0 });
                Matter.Body.setVelocity(crown, { x: 0, y: 0 });
            }
            if (cmd.action === 'Fracture') {
                const glass = bodies.filter(b => b.label === 'glass');
                Matter.Composite.remove(engine.world, glass);
            }
            if (cmd.action === 'Duplicate') {
                const debris = bodies.filter(b => b.label === 'debris');
                debris.forEach(d => {
                    const clone = Matter.Bodies.rectangle(d.position.x + 30, d.position.y - 30, 40, 40, { frictionAir: 0.001, density: 0.05, label: 'debris', plugin: { w: 40, h: 40 } });
                    Matter.Composite.add(engine.world, clone);
                });
            }
            if ((cmd.action === 'Magnetize' || cmd.action === 'Repel') && dagger && lodestones.length > 0) {
                customForce = () => {
                    lodestones.forEach(stone => {
                        const forceMagnitude = 0.005 * dagger.mass;
                        const dx = stone.position.x - dagger.position.x;
                        const dy = stone.position.y - dagger.position.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const force = { 
                            x: (cmd.action === 'Magnetize' ? 1 : -1) * (dx / dist) * forceMagnitude, 
                            y: (cmd.action === 'Magnetize' ? 1 : -1) * (dy / dist) * forceMagnitude 
                        };
                        Matter.Body.applyForce(dagger, dagger.position, force);
                    });
                };
            }
            if (cmd.action === 'AlterMass' && dagger) {
                Matter.Body.setDensity(dagger, dagger.density * 5);
            }
        });

        if (customForce) {
            beforeUpdateCallback.current = customForce;
            Matter.Events.on(engine, 'beforeUpdate', beforeUpdateCallback.current);
        }

        let tragedyTriggered = false;
        const collisionListener = (event) => {
            event.pairs.forEach(pair => {
                const labelA = pair.bodyA.label;
                const labelB = pair.bodyB.label;
                
                const isDaggerCrown = (labelA === 'dagger' && labelB === 'crown') ||
                                      (labelB === 'dagger' && labelA === 'crown');
                                      
                const isCrownBoundary = (labelA === 'crown' && ['wall', 'ground', 'ceiling'].includes(labelB)) ||
                                        (labelB === 'crown' && ['wall', 'ground', 'ceiling'].includes(labelA));

                if (isDaggerCrown || isCrownBoundary) {
                    if (!tragedyTriggered) {
                        tragedyTriggered = true;
                        Matter.Runner.stop(runnerRef.current);
                        if (onTragedy) onTragedy();
                    }
                }
            });
        };
        Matter.Events.on(engine, 'collisionStart', collisionListener);

        const runner = Matter.Runner.create();
        runnerRef.current = runner;
        Matter.Runner.run(runner, engine);

        const turnTimer = setTimeout(() => {
            Matter.Runner.stop(runner);
            Matter.Events.off(engine, 'collisionStart', collisionListener);
            if (onTurnEnd && !tragedyTriggered) onTurnEnd();
        }, 5000); 

        return () => {
            clearTimeout(turnTimer);
            Matter.Events.off(engine, 'collisionStart', collisionListener);
        };

    }, [commands, simulationPhase]);

    return (
        <canvas ref={canvasRef} width={800} height={600} style={{ display: 'block', margin: '0 auto', border: 'none', maxWidth: '100%', height: 'auto' }} />
    );
}
