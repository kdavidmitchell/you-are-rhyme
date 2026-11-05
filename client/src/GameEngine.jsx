import React, { useState } from 'react';

const TILE_SIZE = 40; // Pixels per tile
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;

const GameEngine = ({ config, commands, simulationPhase, onTurnEnd, onHamletWin }) => {
    const [entities, setEntities] = useState(() => config?.entities || []);
    const [prevConfigId, setPrevConfigId] = useState(config?.id);
    const containerRef = React.useRef(null);
    const [scale, setScale] = useState(1);

    React.useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const availWidth = containerRef.current.clientWidth;
                if (availWidth > 0 && availWidth < (GRID_WIDTH * TILE_SIZE)) {
                    setScale(availWidth / (GRID_WIDTH * TILE_SIZE));
                } else {
                    setScale(1);
                }
            }
        };
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    // Adjust state during render when a new level configuration arrives
    if (!simulationPhase && config?.id && config.id !== prevConfigId) {
        setPrevConfigId(config.id);
        setEntities(config.entities || []);
    }

    // Handle incoming parameterized commands
    React.useEffect(() => {
        if (!simulationPhase) return;

        let timeoutIds = [];
        let totalDuration = 1000;

        if (commands && commands.length > 0) {
            totalDuration = (commands.length * 1000) + 700;

            commands.forEach((cmd, idx) => {
                const tId = setTimeout(() => {
                    setEntities(prevEntities => {
                        let state = JSON.parse(JSON.stringify(prevEntities));
                        let rapier = state.find(e => e.type === 'rapier');
                        let gertrude = state.find(e => e.type === 'gertrude');
                        let polonius = state.find(e => e.type === 'polonius');
                        let hamlet = state.find(e => e.type === 'hamlet');

                        if (!rapier || !hamlet || !polonius) return state;

                        let rapierAttached = (hamlet.y === rapier.y && hamlet.x === rapier.x - 1);

                        const p = cmd.parameters || {};
                        const action = cmd.action;
                        const discreteSteps = typeof p.discreteSteps === 'number' ? p.discreteSteps : 2;
                        const charge = typeof p.charge === 'number' ? p.charge : 0.3;
                        const agility = typeof p.agility === 'number' ? p.agility : 0.3;
                        const isCharged = !!p.isCharged || charge >= 0.5;
                        const isUnstable = !!p.isUnstable || (p.instability || 0) >= 0.4;

                        // -------------------------------------------------------------
                        // GERTRUDE DEFENSES
                        // -------------------------------------------------------------
                        if (action === 'Barricade') {
                            // Relocate nearest furniture piece directly in front of Hamlet's rapier
                            const targetX = Math.min(rapier.x + 1, polonius.x - 1);
                            const targetY = rapier.y;
                            const furnitures = state.filter(e => e.type === 'furniture' && !(e.x === targetX && e.y === targetY));
                            if (furnitures.length > 0) {
                                furnitures.sort((a, b) => (Math.abs(a.x - targetX) + Math.abs(a.y - targetY)) - (Math.abs(b.x - targetX) + Math.abs(b.y - targetY)));
                                furnitures[0].x = targetX;
                                furnitures[0].y = targetY;
                            } else if (targetX > rapier.x) {
                                state.push({ type: 'furniture', x: targetX, y: targetY });
                            }
                        }

                        if (action === 'Interpose' && gertrude) {
                            gertrude.y = rapier.y;
                            gertrude.x = Math.max(rapier.x + 1, Math.floor((rapier.x + polonius.x) / 2));
                        }

                        if (action === 'Repel' && rapier) {
                            // Capped at 2 tiles so Hamlet gains net ground on forward lunges
                            const knockback = Math.max(1, Math.min(2, discreteSteps));
                            rapier.x = Math.max(1, rapier.x - knockback);
                            if (rapierAttached) {
                                hamlet.x = Math.max(0, rapier.x - 1);
                            }
                        }

                        if (action === 'Disarm' && rapier) {
                            const shift = discreteSteps >= 3 ? 3 : 2;
                            if (rapier.y >= 12) rapier.y -= shift;
                            else if (rapier.y <= 2) rapier.y += shift;
                            else rapier.y += (Math.random() > 0.5 ? shift : -shift);

                            rapier.y = Math.max(1, Math.min(13, rapier.y));
                            rapierAttached = false;
                        }

                        // -------------------------------------------------------------
                        // HAMLET ATTACKS
                        // -------------------------------------------------------------
                        if (!rapierAttached && action !== 'Feint') {
                            return state;
                        }

                        if (action === 'Feint') {
                            const maneuverSteps = Math.max(1, Math.min(3, Math.round(1 + agility * 2)));
                            if (!rapierAttached) {
                                if (hamlet.y < rapier.y) hamlet.y = Math.min(hamlet.y + maneuverSteps, rapier.y);
                                else if (hamlet.y > rapier.y) hamlet.y = Math.max(hamlet.y - maneuverSteps, rapier.y);

                                hamlet.x = Math.min(hamlet.x + 1, rapier.x - 1);
                                if (hamlet.y === rapier.y && hamlet.x === rapier.x - 1) {
                                    rapierAttached = true;
                                }
                            } else {
                                const gertrudeInWay = gertrude && gertrude.y === rapier.y && gertrude.x > rapier.x;
                                if (rapier.y < polonius.y) {
                                    rapier.y = Math.min(rapier.y + maneuverSteps, polonius.y);
                                    hamlet.y = rapier.y;
                                } else if (rapier.y > polonius.y) {
                                    rapier.y = Math.max(rapier.y - maneuverSteps, polonius.y);
                                    hamlet.y = rapier.y;
                                } else if (gertrudeInWay) {
                                    // Already on the same row as Polonius, but Gertrude is blocking the path.
                                    // Randomly maneuver up or down around Gertrude.
                                    const canGoUp = rapier.y > 1;
                                    const canGoDown = rapier.y < 13;
                                    let dir = 0;
                                    if (canGoUp && canGoDown) {
                                        dir = Math.random() < 0.5 ? -1 : 1;
                                    } else if (canGoUp) {
                                        dir = -1;
                                    } else if (canGoDown) {
                                        dir = 1;
                                    }
                                    rapier.y = Math.max(0, Math.min(14, rapier.y + dir));
                                    hamlet.y = rapier.y;
                                }
                                rapier.x = Math.min(17, rapier.x + 1);
                                hamlet.x = rapier.x - 1;
                            }
                        }

                        if (rapierAttached) {
                            if (action === 'Fracture') {
                                const adjIdx = state.findIndex(e =>
                                    (e.type === 'arras' || e.type === 'furniture') &&
                                    e.x === rapier.x + 1 && e.y === rapier.y
                                );
                                if (adjIdx !== -1) {
                                    state.splice(adjIdx, 1);
                                }
                                if (isUnstable) {
                                    const collateralIdx = state.findIndex(e =>
                                        (e.type === 'arras' || e.type === 'furniture') &&
                                        e.x === rapier.x + 1 && Math.abs(e.y - rapier.y) === 1
                                    );
                                    if (collateralIdx !== -1) {
                                        state.splice(collateralIdx, 1);
                                    }
                                }
                                rapier.x = Math.min(17, rapier.x + 1);
                                hamlet.x = rapier.x - 1;
                            }

                            let moveDistance = 0;
                            let pierceFurniture = false;
                            let pierceArras = false;

                            if (action === 'Lunge') {
                                moveDistance = discreteSteps;
                                if (isCharged) pierceFurniture = true;
                            }

                            if (action === 'Pierce') {
                                moveDistance = Math.max(3, discreteSteps);
                                pierceFurniture = true;
                                pierceArras = true; // Any Pierce formaction penetrates the arras
                            }

                            if (moveDistance > 0) {
                                for (let step = 0; step < moveDistance; step++) {
                                    rapier.x++;
                                    hamlet.x++;

                                    const hit = state.find(e =>
                                        e !== rapier && e !== hamlet &&
                                        e.x === rapier.x && e.y === rapier.y
                                    );

                                    if (hit) {
                                        if (hit.type === 'polonius' || hit.type === 'dead') {
                                            hit.type = 'dead';
                                            if (onHamletWin) setTimeout(onHamletWin, 450);
                                            break;
                                        } else if (hit.type === 'gertrude') {
                                            rapier.x--;
                                            hamlet.x--;
                                            break;
                                        } else if (hit.type === 'arras') {
                                            if (!pierceArras) {
                                                rapier.x--;
                                                hamlet.x--;
                                                break;
                                            } else {
                                                // Penetrate through the Arras: strikes Polonius if concealed behind this section
                                                if (polonius && (polonius.y === rapier.y || Math.abs(polonius.y - rapier.y) <= 1)) {
                                                    rapier.x = polonius.x;
                                                    rapier.y = polonius.y;
                                                    hamlet.x = rapier.x - 1;
                                                    hamlet.y = rapier.y;
                                                    polonius.type = 'dead';
                                                    if (onHamletWin) setTimeout(onHamletWin, 450);
                                                    break;
                                                }
                                            }
                                        } else if (hit.type === 'furniture') {
                                            if (!pierceFurniture) {
                                                rapier.x--;
                                                hamlet.x--;
                                                break;
                                            }
                                        }
                                    }

                                    if (rapier.x >= 18) break;
                                }
                            }
                        }

                        return state;
                    });
                }, idx * 1000);
                timeoutIds.push(tId);
            });
        }

        const endTurnTimer = setTimeout(() => {
            if (onTurnEnd) onTurnEnd();
        }, totalDuration);
        timeoutIds.push(endTurnTimer);

        return () => {
            timeoutIds.forEach(id => clearTimeout(id));
        };
    }, [commands, simulationPhase, onTurnEnd, onHamletWin]);

    /**
     * Renders 1604 Inked Quarto lead type blocks and woodcut props.
     */
    const renderQuartoEntity = (ent) => {
        switch (ent.type) {
            case 'hamlet':
                return (
                    <div style={{
                        width: '34px',
                        height: '34px',
                        background: '#14110e',
                        border: '2px solid #14110e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Cinzel, Georgia, serif',
                        fontSize: '19px',
                        fontWeight: '900',
                        color: '#f4eee2',
                        userSelect: 'none'
                    }}>
                        H
                    </div>
                );

            case 'gertrude':
                return (
                    <div style={{
                        width: '34px',
                        height: '34px',
                        background: '#5c1e24',
                        border: '2px solid #14110e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Cinzel, Georgia, serif',
                        fontSize: '19px',
                        fontWeight: '900',
                        color: '#f4eee2',
                        userSelect: 'none'
                    }}>
                        G
                    </div>
                );

            case 'polonius':
                return (
                    <div style={{
                        width: '34px',
                        height: '34px',
                        background: '#3a2818',
                        border: '2px solid #14110e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Cinzel, Georgia, serif',
                        fontSize: '19px',
                        fontWeight: '900',
                        color: '#f4eee2',
                        userSelect: 'none'
                    }}>
                        P
                    </div>
                );

            case 'dead':
                return (
                    <div style={{
                        width: '32px',
                        height: '32px',
                        background: '#dfd5c0',
                        border: '2px dashed #5c1e24',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Cinzel, Georgia, serif',
                        fontSize: '18px',
                        fontWeight: '900',
                        color: '#5c1e24'
                    }}>
                        &#10013;
                    </div>
                );

            case 'rapier':
                return (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '38px',
                        height: '16px',
                        position: 'relative'
                    }}>
                        {/* Iron Crossguard */}
                        <div style={{ width: '3px', height: '14px', background: '#14110e' }} />
                        {/* Blade Rule */}
                        <div style={{
                            width: '26px',
                            height: '2.5px',
                            background: '#14110e'
                        }} />
                        {/* Inked Barb Tip */}
                        <div style={{
                            width: 0,
                            height: 0,
                            borderTop: '3.5px solid transparent',
                            borderBottom: '3.5px solid transparent',
                            borderLeft: '6px solid #14110e'
                        }} />
                    </div>
                );

            case 'arras':
                return (
                    <div style={{
                        width: '32px',
                        height: '38px',
                        background: '#5c1e24',
                        border: '2px solid #14110e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f4eee2',
                        fontFamily: 'Space Mono, monospace',
                        fontSize: '10px',
                        fontWeight: '900',
                        letterSpacing: '-1px',
                        userSelect: 'none'
                    }}>
                        |||
                    </div>
                );

            case 'furniture':
                return (
                    <div style={{
                        width: '30px',
                        height: '30px',
                        background: '#cfc3ad',
                        border: '2px solid #14110e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Cinzel, serif',
                        fontSize: '14px',
                        color: '#14110e',
                        fontWeight: '900',
                        userSelect: 'none'
                    }}>
                        &#9632;
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div ref={containerRef} style={{ width: '100%', maxWidth: `${GRID_WIDTH * TILE_SIZE}px`, display: 'flex', justifyContent: 'center' }}>
            <div style={{
                position: 'relative',
                width: `${GRID_WIDTH * TILE_SIZE}px`,
                height: `${GRID_HEIGHT * TILE_SIZE}px`,
                backgroundColor: '#eae2d0',
                margin: '0 auto',
                transform: scale < 1 ? `scale(${scale})` : undefined,
                transformOrigin: 'top center',
                marginBottom: scale < 1 ? `${-(GRID_HEIGHT * TILE_SIZE * (1 - scale))}px` : undefined,
                backgroundImage: `
                    linear-gradient(to right, #cfc5af 1px, transparent 1px),
                    linear-gradient(to bottom, #cfc5af 1px, transparent 1px)
                `,
                backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
                border: '4px double #14110e',
                overflow: 'hidden'
            }}>
                {/* Typesetter's Stamped Corner Markers */}
                <div style={{ position: 'absolute', top: '3px', left: '3px', width: '10px', height: '10px', borderTop: '3px solid #14110e', borderLeft: '3px solid #14110e', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: '3px', right: '3px', width: '10px', height: '10px', borderTop: '3px solid #14110e', borderRight: '3px solid #14110e', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '3px', left: '3px', width: '10px', height: '10px', borderBottom: '3px solid #14110e', borderLeft: '3px solid #14110e', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '3px', right: '3px', width: '10px', height: '10px', borderBottom: '3px solid #14110e', borderRight: '3px solid #14110e', pointerEvents: 'none' }} />

                {/* Arras Chamber Alcove Hatching (Cols 16-19) */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${16 * TILE_SIZE}px`,
                    width: `${4 * TILE_SIZE}px`,
                    background: 'rgba(92, 30, 36, 0.08)',
                    borderLeft: '2px dashed #14110e',
                    pointerEvents: 'none'
                }} />

                {/* Entities Layer */}
                {entities.map(ent => (
                    <div
                        key={ent.id}
                        style={{
                            position: 'absolute',
                            width: `${TILE_SIZE}px`,
                            height: `${TILE_SIZE}px`,
                            transform: `translate3d(${ent.x * TILE_SIZE}px, ${ent.y * TILE_SIZE}px, 0)`,
                            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: ent.type === 'rapier' ? 15 : (ent.type === 'hamlet' || ent.type === 'gertrude' ? 12 : 5)
                        }}
                    >
                        {renderQuartoEntity(ent)}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GameEngine;
