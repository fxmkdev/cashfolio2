import {
  AggregationModule,
  CellApiModule,
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  ColumnHoverModule,
  ColumnMenuModule,
  ContextMenuModule,
  CustomEditorModule,
  DateFilterModule,
  DateEditorModule,
  DragAndDropModule,
  GridStateModule,
  HighlightChangesModule,
  MenuModule,
  ModuleRegistry,
  MultiFilterModule,
  NumberEditorModule,
  NumberFilterModule,
  PinnedRowModule,
  QuickFilterModule,
  RenderApiModule,
  RichSelectModule,
  RowApiModule,
  RowDragModule,
  RowGroupingModule,
  RowSelectionModule,
  RowStyleModule,
  ScrollApiModule,
  SelectEditorModule,
  SetFilterModule,
  TextEditorModule,
  TextFilterModule,
  TooltipModule,
  TreeDataModule,
  ValidationModule,
} from "ag-grid-enterprise";

let gridModulesRegistered = false;

const GRID_MODULES = [
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  CellApiModule,
  RowApiModule,
  ScrollApiModule,
  RenderApiModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  ColumnHoverModule,
  CellStyleModule,
  HighlightChangesModule,
  RowStyleModule,
  RowSelectionModule,
  PinnedRowModule,
  TooltipModule,
  TextEditorModule,
  NumberEditorModule,
  DateEditorModule,
  CustomEditorModule,
  SelectEditorModule,
  QuickFilterModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  RowDragModule,
  DragAndDropModule,
  GridStateModule,
  SetFilterModule,
  MultiFilterModule,
  RichSelectModule,
  RowGroupingModule,
  TreeDataModule,
  AggregationModule,
  MenuModule,
  ColumnMenuModule,
  ContextMenuModule,
];

export function ensureGridModulesRegistered() {
  if (gridModulesRegistered) {
    return;
  }

  ModuleRegistry.registerModules(GRID_MODULES);

  if (import.meta.env.DEV) {
    ModuleRegistry.registerModules([ValidationModule]);
  }

  gridModulesRegistered = true;
}
