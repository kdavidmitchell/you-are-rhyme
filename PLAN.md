# PLAN.md: Aesthetic & Design Overhaul — The Elizabethan Chamber Proscenium

## 1. Executive Summary & Design Foundations

This aesthetic overhaul elevates *You Are Rhyme* from an experimental tech demo into a piece of serious artistic software. The interface is reconceptualized as an **Elizabethan Chamber Proscenium**: a dark, high-contrast, editorial folio environment that treats speech as a serious physical instrument and Shakespeare's text as an executable dramatic monument.

### Core Aesthetic Axioms
1. **Zero Emojis**: Complete elimination of emojis across the client, HUD, toasts, and alerts.
2. **Dark Editorial Folio Palette**: An austere, high-contrast palette of deep obsidian (`#0c0d0e`), stone charcoal (`#16181b`), warm bone parchment (`#f4efe6`), burnished gold (`#c29b38`), and iron-gall crimson (`#9e2a2b`).
3. **Classical Typographic Rigor**: High-grade serif typography (Cormorant Garamond, Cinzel) for titles, dialogue, and cues, paired with refined tabular monospace for physical telemetry and cadence gauges.
4. **Heraldic Stagecraft Glyphs**: Replacement of raw ASCII characters (`H`, `G`, `P`, `|||`, `==>`, `[]`) with engraved heraldic crests, woven arras drapery, and a directional dueling foil.
5. **In-Situ Dramaturgical Direction**: Elimination of intrusive browser `alert()` popups and gamified toasts in favor of integrated Elizabethan stage directions (e.g., *[Exit POLONIUS, slain behind the arras.]*).

---

## 2. Phase 1: Global Theme, Design Tokens & Typography

### 2.1 Color & Surface Hierarchy
- `--bg-canvas`: `#0a0b0d` (Deep obsidian chamber)
- `--surface-card`: `#131518` (Dark slate card surfaces)
- `--surface-border`: `#282c34` (Refined metallic/stone rules)
- `--text-primary`: `#f3eee5` (Warm bone parchment)
- `--text-secondary`: `#9da5b4` (Muted silver-ash)
- `--accent-gold`: `#c29b38` (Burnished Elizabethan gold for royalties & par)
- `--accent-crimson`: `#9e2a2b` (Iron-gall blood crimson for Polonius & tension)
- `--accent-steel`: `#528bff` (Cold tempered steel for Hamlet's blade)

### 2.2 Typography Hierarchy
- **Display & Acts**: *Cinzel* / Classical Roman Small Caps (Letter-spacing: `0.08em`).
- **Dramatic Verse & Cues**: *Cormorant Garamond* / Classical Book Serif (Font-size: `1.25rem`, line-height: `1.6`).
- **Telemetry & Gauges**: *Space Mono* / Tabular Numbers for precise $\Delta$WPM, RMS volume, and tension percentages.

---

## 3. Phase 2: The Tactical Grid & Heraldic Stagecraft Glyphs (`GameEngine.jsx`)

### 3.1 Entity Representation
Replace bare monospace letters with bespoke SVG/CSS heraldic seals:
- **Hamlet (The Prince)**: Engraved silver-and-steel crested medallion bearing an authentic serif `H`, bordered with cold steel trim.
- **Gertrude (The Queen)**: Royal damask medallion in deep crimson and burnished gold with a delicate coronet motif and serif `G`.
- **Polonius (The Counselor)**: Muted amber/ochre seal with counselor's seal `P`, concealed in the shadows.
- **The Rapier**: Slender directional dueling foil glyph with an illuminated tip indicating weapon reach and orientation.
- **The Arras**: Woven architectural tapestry texture with vertical textile folds and fringe (`▓▓▓` hatch motif on deep velvet).
- **Furniture**: Carved Jacobean oak furniture blocks with subtle woodgrain framing.
- **Slain Marker**: A dignified, crossed-quill / fallen marker replacing the crude `X`.

### 3.2 Visual Feedback & Dynamic Impulses
- Display dynamic action vectors during execution (e.g. subtle kinetic trail when Hamlet lunges or Gertrude repels).
- Smooth CSS easing transitions (`transform: translate3d`) for all 20×15 grid movements.

---

## 4. Phase 3: Chamber Dramaturgy HUD & Stage Directions (`App.jsx`)

### 4.1 Dramaturgical Three-Column Proscenium Layout
- **Left Column: The Cue Roll & Vocal Controls**
  - Prompt container styled as an actor's cue-script parchment.
  - Previous cue line displayed in muted ash for context.
  - Active line presented in illuminated classical verse.
  - Dignified vocal delivery button ("Deliver Line" $\rightarrow$ "Conclude Delivery") with a live prosody level bar (RMS + Pause).
  - Collapsible *Formaction Affordances* ledger explaining the acoustic-mechanical mappings.
- **Center Column: The Queen's Closet Stage**
  - 20×15 grid stage framed with dark stone architectural borders.
  - **In-Situ Stage Direction Ticker**: A dedicated editorial ticker below the stage printing authentic stage directions:
    - *[HAMLET lunges with fierce report, advancing 3 paces.]*
    - *[The QUEEN solidifies the chamber furnishings.]*
    - *[POLONIUS cries out from behind the arras.]*
    - *[Exit POLONIUS, slain behind the arras.]*
- **Right Column: The Dramatic Ledger**
  - **Scene Progression**: Roman numerals (e.g., *Line IV of XVIII*).
  - **Dramatic Tension Curve**: Real-time gauge reflecting calculated scene tension and proximity to the climax.
  - **MAP-Elites Stage Archetype**: Displays room classification from SQLite (e.g. *Chamber Claustrophobia: 0.55 | Tactical Resistance: High*).
  - **Dramatis Personae Status**: Live character vitality and equipment state (Hamlet: *Armed* / *Disarmed*, Gertrude: *Interposing* / *Solidifying*, Polonius: *Concealed* / *Slain*).

---

## 5. Phase 4: Theatrical Playbill Entry Portal (`App.jsx`)

### 5.1 Portal Screen Architecture
When `!role`, render a formal Elizabethan Playbill:
- **Title Block**:
  - *YOU ARE RHYME*
  - *A Voice-Activated Theatrical Duel in the Queen's Closet*
  - *Act III, Scene IV of William Shakespeare's Tragedy of Hamlet*
- **Dramaturgical Synopsis**:
  - A brief, serious artistic framing of Palfrey's *formactions*: how vocal acoustic performance exerts mechanical control upon the physical space of Elsinore.
- **Role Selection Triptych**:
  - Three distinct heraldic cards with crests and character mottos:
    1. **Hamlet, Prince of Denmark** — *"I will speak daggers to her, but use none."*
    2. **Gertrude, Queen of Denmark** — *"O Hamlet, speak no more: Thou turn'st mine eyes into my very soul."*
    3. **Audience / Spectator** — *"Observe the theatrical machinery from the proscenium."*

---

## 6. Execution Deliverables & Verification Protocol

1. **Stylesheet Transformation**:
   - Update `client/src/App.css` and `client/src/index.css` with dark editorial folio design tokens, custom font imports, and clean layout rules.
2. **Component Upgrades**:
   - Refactor `client/src/GameEngine.jsx` to render heraldic stagecraft seals and smooth tactical vector animations.
   - Refactor `client/src/App.jsx` to implement the Playbill portal, the Three-Column Proscenium, the in-situ stage direction ticker, and eradicate all emojis and `alert()` calls.
3. **Build & Integration Test**:
   - Run `npx vite build` to ensure the production bundle builds cleanly.
   - Verify server-side integration tests continue to pass.
