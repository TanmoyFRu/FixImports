import * as vscode from 'vscode';
import { FixImportsConfig } from '../core/types';

export const DEFAULT_CONFIG: FixImportsConfig = {
  preserveConditionalImports: [
    'typing',
    'TYPE_CHECKING',
    'sys.version_info',
    'sys.platform'
  ],
  sortImportsAfterMove: true,
  groupByOrigin: true,
  enableDiagnostics: true,
  insertPassOnEmptyBlock: true
};

export function getConfiguration(): FixImportsConfig {
  const config = vscode.workspace.getConfiguration('fixImports');

  return {
    preserveConditionalImports: config.get<string[]>(
      'preserveConditionalImports',
      DEFAULT_CONFIG.preserveConditionalImports
    ),
    sortImportsAfterMove: config.get<boolean>(
      'sortImportsAfterMove',
      DEFAULT_CONFIG.sortImportsAfterMove
    ),
    groupByOrigin: config.get<boolean>(
      'groupByOrigin',
      DEFAULT_CONFIG.groupByOrigin
    ),
    enableDiagnostics: config.get<boolean>(
      'enableDiagnostics',
      DEFAULT_CONFIG.enableDiagnostics
    ),
    insertPassOnEmptyBlock: config.get<boolean>(
      'python.insertPassOnEmptyBlock',
      DEFAULT_CONFIG.insertPassOnEmptyBlock
    )
  };
}
