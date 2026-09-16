// 20x15 grid layout (40px tiles)

function getRandomGenotype() {
    return {
        poloniusY: Math.floor(Math.random() * 10) + 2, // 2 to 11
        arrasStartY: Math.floor(Math.random() * 4) + 1, 
        arrasLength: Math.floor(Math.random() * 6) + 4, // 4 to 9 tiles long
        gertrudeX: Math.floor(Math.random() * 5) + 8, // 8 to 12
        gertrudeY: Math.floor(Math.random() * 8) + 3, // 3 to 10
        hamletX: Math.floor(Math.random() * 4) + 2, // 2 to 5
        hamletY: Math.floor(Math.random() * 8) + 3, // 3 to 10
        furniture: Array.from({ length: Math.floor(Math.random() * 6) + 3 }, () => ({
            x: Math.floor(Math.random() * 12) + 4, // 4 to 15
            y: Math.floor(Math.random() * 11) + 2 // 2 to 12
        }))
    };
}

function generateLevel(levelId, genotype = null) {
    if (!genotype) {
        genotype = getRandomGenotype();
    }

    const gridWidth = 20;
    const gridHeight = 15;
    const entities = [];

    // Polonius (Target, x: 18)
    const poloniusY = Math.max(1, Math.min(13, genotype.poloniusY));
    entities.push({ id: 'polonius', type: 'polonius', x: 18, y: poloniusY });

    // The Arras (Barrier, x: 16)
    for (let i = 0; i < genotype.arrasLength; i++) {
        let y = genotype.arrasStartY + i;
        if (y < 14) {
            entities.push({ id: `arras_${i}`, type: 'arras', x: 16, y: y });
        }
    }

    // Gertrude
    entities.push({ 
        id: 'gertrude', 
        type: 'gertrude', 
        x: Math.max(2, Math.min(17, genotype.gertrudeX)), 
        y: Math.max(1, Math.min(13, genotype.gertrudeY)) 
    });

    // Hamlet
    const hX = Math.max(1, Math.min(17, genotype.hamletX));
    const hY = Math.max(1, Math.min(13, genotype.hamletY));
    entities.push({ id: 'hamlet', type: 'hamlet', x: hX, y: hY });

    // Rapier (Starts right of Hamlet)
    entities.push({ id: 'rapier', type: 'rapier', x: hX + 1, y: hY });

    // Furniture
    genotype.furniture.forEach((furn, i) => {
        entities.push({ 
            id: `furn_${i}`, 
            type: 'furniture', 
            x: Math.max(1, Math.min(17, furn.x)), 
            y: Math.max(1, Math.min(13, furn.y)) 
        });
    });

    return {
        id: levelId || `lvl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        gridWidth,
        gridHeight,
        entities,
        genotype
    };
}

module.exports = { generateLevel, getRandomGenotype };
