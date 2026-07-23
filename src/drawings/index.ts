import { registerBuiltInLineDrawings } from './built-in-line-drawings.js';
import { registerBuiltInShapeDrawings } from './built-in-shape-drawings.js';
import { registerBuiltInAnalysisDrawings } from './built-in-analysis-drawings.js';
import { registerBuiltInPositionDrawings } from './built-in-position-drawings.js';
import { drawingDefinitionRegistry } from './drawing-registry.js';

registerBuiltInLineDrawings(drawingDefinitionRegistry);
registerBuiltInShapeDrawings(drawingDefinitionRegistry);
registerBuiltInAnalysisDrawings(drawingDefinitionRegistry);
registerBuiltInPositionDrawings(drawingDefinitionRegistry);

export * from './drawing-model.js';
export * from './drawing-registry.js';
export * from './drawing-controller.js';
export * from './drawing-magnet.js';
export * from './interactive-drawing-primitive.js';
export * from './built-in-line-drawings.js';
export * from './built-in-shape-drawings.js';
export * from './built-in-analysis-drawings.js';
export * from './built-in-position-drawings.js';
