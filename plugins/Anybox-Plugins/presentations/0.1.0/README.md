# Presentations

Code-first Anybox plugin for creating editable PowerPoint `.pptx` decks from executable slide modules.

## Workflow

```bash
npm install
node scripts/render_slide.mjs --workspace workspaces/sample-basic --slide slides/slide-01.mjs
node scripts/check_layout_quality.mjs --workspace workspaces/sample-basic
node scripts/build_deck.mjs --workspace workspaces/sample-basic
```

Slide modules live in `workspaces/<task-id>/slides/slide-XX.mjs` and export `slideXX(presentation, ctx)`.

The runtime writes preview PNG/SVG files, layout JSON, a contact sheet, and the final editable PPTX into the task workspace.
