function getRandomGenotype() {
    return {
        crownX: 300 + Math.random() * 200,
        crownY: 150 + Math.random() * 300,
        daggerOffsetX: Math.random() * 200 - 100,
        daggerOffsetY: Math.random() * 200 - 100,
        gravityX: (Math.random() * 2) - 1,
        gravityY: (Math.random() * 2) - 1,
        obstacles: Array.from({ length: Math.floor(Math.random() * 3) + 2 }, () => ({
            x: 100 + Math.random() * 600,
            y: 100 + Math.random() * 400,
            angle: Math.random() * Math.PI,
            isGlass: Math.random() > 0.2
        })),
        debris: Array.from({ length: Math.floor(Math.random() * 2) + 1 }, () => ({
            offsetX: Math.random() * 200 - 100,
            offsetY: Math.random() * 200 - 100
        })),
        lodestones: Array.from({ length: Math.floor(Math.random() * 2) + 1 }, () => ({
            offsetX: Math.random() * 300 - 150,
            offsetY: Math.random() * 300 - 150
        }))
    };
}

function generateLevel(levelId, genotype = null) {
    if (!genotype) {
        genotype = getRandomGenotype();
    }

    // 1. Static Boundaries
    const bodies = [
        { type: 'rectangle', x: 400, y: 570, w: 810, h: 60, options: { isStatic: true, label: 'ground' } },
        { type: 'rectangle', x: 10, y: 300, w: 60, h: 600, options: { isStatic: true, label: 'wall' } },
        { type: 'rectangle', x: 790, y: 300, w: 60, h: 600, options: { isStatic: true, label: 'wall' } },
        { type: 'rectangle', x: 400, y: 10, w: 810, h: 60, options: { isStatic: true, label: 'ceiling' } }
    ];

    // 2. The Crown
    const crownX = genotype.crownX;
    const crownY = genotype.crownY || 500;
    bodies.push({
        type: 'circle', x: crownX, y: crownY, r: 30, options: { label: 'crown', density: 0.05 }
    });

    // 3. The Dagger
    const daggerX = crownX + (genotype.daggerOffsetX !== undefined ? genotype.daggerOffsetX : (genotype.daggerOffset || 0));
    const daggerY = crownY + (genotype.daggerOffsetY !== undefined ? genotype.daggerOffsetY : -420);
    const gravX = genotype.gravityX || 0;
    const gravY = genotype.gravityY !== undefined ? genotype.gravityY : 1;
    // Math.atan2 gives angle in radians. Down is PI/2. 
    // Matter.js angle 0 means unrotated (pointing down for our 'V' rendering).
    // So if grav is Down (PI/2), dagger angle should be 0.
    const daggerAngle = Math.atan2(gravY, gravX) - Math.PI/2;
    bodies.push({
        type: 'rectangle', x: daggerX, y: daggerY, w: 20, h: 80, options: { frictionAir: 0.02, label: 'dagger', density: 0.05, angle: daggerAngle }
    });

    // 4. Procedural Obstacles & Glass
    genotype.obstacles.forEach((obs) => {
        let obsX = obs.x !== undefined ? obs.x : (obs.isLeft ? crownX - 100 - obs.offset : crownX + 100 + obs.offset);
        let obsY = obs.y !== undefined ? obs.y : 300;
        let angle = obs.angle !== undefined ? obs.angle : (obs.isLeft ? Math.PI / 8 : -Math.PI / 8);
        bodies.push({
            type: 'rectangle', x: obsX, y: obsY, w: 250, h: 20, 
            options: { isStatic: true, angle: angle, label: obs.isGlass ? 'glass' : 'obstacle' }
        });
    });

    // 5. Dynamic Debris
    genotype.debris.forEach((deb) => {
        bodies.push({
            type: 'rectangle', x: crownX + deb.offsetX, y: crownY + (deb.offsetY || -400), w: 40, h: 40, 
            options: { density: 0.05, label: 'debris' }
        });
    });

    // 6. Magnetic Nodes (Lodestones)
    genotype.lodestones.forEach((lode) => {
        bodies.push({
            type: 'circle', x: crownX + lode.offsetX, y: lode.y || (crownY + (lode.offsetY || -300)), r: 15,
            options: { isStatic: true, isSensor: true, label: 'lodestone' }
        });
    });

    return {
        id: levelId || `lvl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        gravityX: genotype.gravityX || 0,
        gravityY: genotype.gravityY !== undefined ? genotype.gravityY : 1, 
        bodies: bodies,
        genotype: genotype
    };
}

module.exports = { generateLevel, getRandomGenotype };
