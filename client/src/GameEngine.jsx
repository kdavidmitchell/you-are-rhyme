import React, { useEffect, useState } from 'react';

const TILE_SIZE = 40; // Pixels per tile
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;

const GameEngine = ({ config, commands, simulationPhase, onTurnEnd, onHamletWin }) => {
    const [entities, setEntities] = useState([]);

    useEffect(() => {
        if (!config || !config.entities) return;
        if (!simulationPhase) {
            setEntities(config.entities);
        }
    }, [config, simulationPhase]);

    // Handle incoming commands
    useEffect(() => {
        if (!simulationPhase) return;
        
        let timeoutIds = [];
        let totalDuration = 1000; // Base 1s delay even with no commands

        if (commands && commands.length > 0) {
            totalDuration = (commands.length * 1000) + 1000;
            
            commands.forEach((cmd, idx) => {
                const tId = setTimeout(() => {
                    setEntities(prevEntities => {
                        let state = JSON.parse(JSON.stringify(prevEntities));
                        let rapier = state.find(e => e.type === 'rapier');
                        let gertrude = state.find(e => e.type === 'gertrude');
                        let polonius = state.find(e => e.type === 'polonius');
                        let hamlet = state.find(e => e.type === 'hamlet');

                        let rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);

                        // Gertrude Defenses
                        if (cmd.action === 'Solidify') {
                            const furnitures = state.filter(e => e.type === 'furniture');
                            if (furnitures.length > 0) {
                                furnitures[Math.floor(Math.random() * furnitures.length)].type = 'arras';
                            }
                        }
                        if (cmd.action === 'Interpose' && rapier && gertrude && polonius) {
                            gertrude.y = rapier.y;
                            gertrude.x = Math.floor((rapier.x + polonius.x) / 2);
                        }
                        if (cmd.action === 'Repel' && rapier) {
                            rapier.x = Math.max(0, rapier.x - 3);
                            if (rapierAttached) hamlet.x = rapier.x - 1;
                        }
                        if (cmd.action === 'Disarm' && rapier) {
                            if (rapier.y >= 12) rapier.y -= 2;
                            else rapier.y += 2;
                            rapierAttached = false;
                        }

                        // Hamlet Attacks
                        if (!rapierAttached && cmd.action !== 'Feint') {
                            return state; // Can't attack without weapon
                        }

                        if (cmd.action === 'Feint') {
                            if (!rapierAttached) {
                                if (hamlet.y < rapier.y) hamlet.y = Math.min(hamlet.y + 2, rapier.y);
                                else if (hamlet.y > rapier.y) hamlet.y = Math.max(hamlet.y - 2, rapier.y);
                                hamlet.x = Math.min(hamlet.x + 1, rapier.x - 1);
                                if (hamlet.y === rapier.y && hamlet.x === rapier.x - 1) rapierAttached = true;
                            } else {
                                if (rapier.y < polonius.y) { rapier.y = Math.min(rapier.y + 2, polonius.y); hamlet.y = rapier.y; }
                                else if (rapier.y > polonius.y) { rapier.y = Math.max(rapier.y - 2, polonius.y); hamlet.y = rapier.y; }
                                rapier.x++; hamlet.x++;
                            }
                        }

                        if (rapierAttached) {
                            if (cmd.action === 'Fracture') {
                                const adj = state.findIndex(e => (e.type === 'arras' || e.type === 'furniture') && e.x === rapier.x + 1 && e.y === rapier.y);
                                if (adj !== -1) state.splice(adj, 1);
                                rapier.x++; hamlet.x++;
                            }

                            let moveDistance = 0;
                            let pierceFurniture = false;
                            if (cmd.action === 'Lunge') moveDistance = 3;
                            if (cmd.action === 'Pierce') { moveDistance = 2; pierceFurniture = true; }

                            if (moveDistance > 0) {
                                for (let step = 0; step < moveDistance; step++) {
                                    rapier.x++; hamlet.x++;
                                    const hit = state.find(e => e !== rapier && e !== hamlet && e.x === rapier.x && e.y === rapier.y);
                                    if (hit) {
                                        if (hit.type === 'polonius' || hit.type === 'dead') {
                                            hit.type = 'dead';
                                            if (onHamletWin) setTimeout(onHamletWin, 500);
                                            break;
                                        } else if (hit.type === 'arras' || hit.type === 'gertrude') {
                                            rapier.x--; hamlet.x--; 
                                            break;
                                        } else if (hit.type === 'furniture' && !pierceFurniture) {
                                            rapier.x--; hamlet.x--;
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        return state;
                    });
                }, idx * 1000); 
                timeoutIds.push(tId);
            });
        }

        // End turn after animations finish
        const endTurnTimer = setTimeout(() => {
            if (onTurnEnd) onTurnEnd();
        }, totalDuration);
        timeoutIds.push(endTurnTimer);

        return () => {
            timeoutIds.forEach(id => clearTimeout(id));
        };
    }, [commands, simulationPhase, onTurnEnd, onHamletWin]);

    const getAsciiForType = (type) => {
        switch (type) {
            case 'hamlet': return 'H';
            case 'gertrude': return 'G';
            case 'polonius': return 'P';
            case 'arras': return '|||';
            case 'rapier': return '==>';
            case 'furniture': return '[]';
            case 'dead': return 'X';
            default: return '?';
        }
    };

    const getColorForType = (type) => {
        switch (type) {
            case 'hamlet': return '#2563eb';
            case 'gertrude': return '#9333ea';
            case 'polonius': return '#dc2626';
            case 'arras': return '#4b5563';
            case 'rapier': return '#f59e0b';
            case 'furniture': return '#8b5cf6';
            case 'dead': return '#000000';
            default: return '#000';
        }
    };

    return (
        <div style={{
            position: 'relative',
            width: `${GRID_WIDTH * TILE_SIZE}px`,
            height: `${GRID_HEIGHT * TILE_SIZE}px`,
            backgroundColor: '#ffffff',
            fontFamily: '"Courier New", Courier, monospace',
            fontWeight: 'bold',
            fontSize: '20px',
            margin: '0 auto',
            backgroundImage: 'linear-gradient(#f0f0f0 1px, transparent 1px), linear-gradient(90deg, #f0f0f0 1px, transparent 1px)',
            backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
            border: '4px solid black'
        }}>
            {entities.map(ent => (
                <div key={ent.id} style={{
                    position: 'absolute',
                    left: `${ent.x * TILE_SIZE}px`,
                    top: `${ent.y * TILE_SIZE}px`,
                    width: `${TILE_SIZE}px`,
                    height: `${TILE_SIZE}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: getColorForType(ent.type),
                    transition: 'all 0.3s ease-out', // Smooth snappy animation between grid tiles
                    zIndex: ent.type === 'rapier' ? 10 : 1
                }}>
                    {getAsciiForType(ent.type)}
                </div>
            ))}
        </div>
    );
};

export default GameEngine;
