import * as vscode from 'vscode';
import type { FeatureRegistrationContext } from '../index';
import type { TextStatsConfig, TokenizerModel } from '../../types';
import type { ExtensionStateManager } from '../../core';
import { TextStatsController } from './controller';
import {
  createTextStatsStatusBarItem,
  showTextStatsItem,
  hideTextStatsItem,
} from './statusBarItem';
import { createToggleCommand, createChangeTokenizerCommand } from './command';
import { performUpdate } from './updateHandler';
import type { UpdateDeps } from './updateHandler';
import {
  CONFIG_KEY,
  COMMAND_ID_TOGGLE,
  COMMAND_ID_CHANGE_TOKENIZER,
  INTRODUCED_AT_VERSION_CODE,
  DEFAULT_DELIMITER,
  DEFAULT_UNIT_SPACE,
  DEFAULT_WPM,
  DEFAULT_TOKENIZER,
  DEFAULT_INCLUDE_WHITESPACE,
  DEFAULT_TOKEN_SIZE_LIMIT,
  DEFAULT_VISIBLE_METRICS,
} from './constants';

function getDefaultConfig(): TextStatsConfig {
  return {
    enabled: true,
    delimiter: DEFAULT_DELIMITER,
    unitSpace: DEFAULT_UNIT_SPACE,
    wpm: DEFAULT_WPM,
    tokenizer: DEFAULT_TOKENIZER,
    includeWhitespace: DEFAULT_INCLUDE_WHITESPACE,
    tokenSizeLimit: DEFAULT_TOKEN_SIZE_LIMIT,
    visibleMetrics: [...DEFAULT_VISIBLE_METRICS],
  };
}

function getConfig(sm: ExtensionStateManager): TextStatsConfig {
  const raw = sm.getConfigSection(CONFIG_KEY);
  if (!raw || typeof raw !== 'object') {
    return { ...getDefaultConfig(), enabled: false };
  }
  return raw as TextStatsConfig;
}

interface FeatureState {
  active: boolean;
  visible: boolean;
  config: TextStatsConfig;
}

interface WiringContext {
  deps: UpdateDeps;
  state: FeatureState;
  triggerUpdate: () => void;
}

function createWiringContext(deps: UpdateDeps): WiringContext {
  const state: FeatureState = {
    active: false,
    visible: true,
    config: getDefaultConfig(),
  };
  const triggerUpdate = (): void => {
    if (!state.active || !state.visible) {
      return;
    }
    deps.controller.scheduleUpdate(() => {
      void performUpdate(deps, state.config);
    });
  };
  return { deps, state, triggerUpdate };
}

function wireCommands(ctx: FeatureRegistrationContext, wc: WiringContext): void {
  const toggle = createToggleCommand(
    () => wc.state.visible,
    (v) => {
      wc.state.visible = v;
      if (v && wc.state.active) {
        showTextStatsItem(wc.deps.item);
        wc.triggerUpdate();
      } else {
        hideTextStatsItem(wc.deps.item);
      }
    }
  );
  ctx.context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_ID_TOGGLE, toggle)
  );

  const tokenizer = createChangeTokenizerCommand(
    () => wc.state.config.tokenizer,
    (model: TokenizerModel) => {
      void ctx.stateManager.updateConfigSection(CONFIG_KEY, {
        ...wc.state.config,
        tokenizer: model,
      });
      wc.deps.controller.dispose();
    }
  );
  ctx.context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_ID_CHANGE_TOKENIZER, tokenizer)
  );
}

function wireStateListeners(ctx: FeatureRegistrationContext, wc: WiringContext): void {
  const { stateManager } = ctx;

  const stateSub = stateManager.onDidChangeState((globalEnabled) => {
    wc.state.config = getConfig(stateManager);
    if (globalEnabled && wc.state.config.enabled) {
      wc.state.active = true;
      if (wc.state.visible) {
        showTextStatsItem(wc.deps.item);
      }
      wc.triggerUpdate();
    } else {
      wc.state.active = false;
      hideTextStatsItem(wc.deps.item);
    }
  });
  ctx.context.subscriptions.push(stateSub);

  const sectionSub = stateManager.onConfigSectionChanged(CONFIG_KEY, (newValue) => {
    wc.state.config = newValue as TextStatsConfig;
    if (wc.state.active) {
      wc.triggerUpdate();
    }
  });
  ctx.context.subscriptions.push(sectionSub);
}

function wireEditorListeners(
  extCtx: vscode.ExtensionContext,
  triggerUpdate: () => void
): void {
  extCtx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      triggerUpdate();
    }),
    vscode.workspace.onDidChangeTextDocument(() => {
      triggerUpdate();
    }),
    vscode.window.onDidChangeTextEditorSelection(() => {
      triggerUpdate();
    })
  );
}

function registerWithCore(ctx: FeatureRegistrationContext): void {
  ctx.migrationRegistry.register({
    key: CONFIG_KEY,
    label: 'Text Stats',
    description: 'Display real-time text statistics in the status bar',
    defaultValue: getDefaultConfig(),
    introducedAtVersionCode: INTRODUCED_AT_VERSION_CODE,
  });
  ctx.stateManager.registerService({
    key: CONFIG_KEY,
    label: 'Text Stats',
    icon: '$(symbol-number)',
    toggleCommandId: COMMAND_ID_TOGGLE,
  });
}

export function registerTextStatsFeature(ctx: FeatureRegistrationContext): void {
  if (!ctx.stateManager.isSingleRoot) {
    return;
  }

  registerWithCore(ctx);

  const item = createTextStatsStatusBarItem();
  ctx.context.subscriptions.push(item);

  const controller = new TextStatsController();
  ctx.context.subscriptions.push({
    dispose: (): void => {
      controller.dispose();
    },
  });

  const deps: UpdateDeps = {
    item,
    controller,
    logger: ctx.logger,
  };
  const wc = createWiringContext(deps);
  wireCommands(ctx, wc);
  wireStateListeners(ctx, wc);
  wireEditorListeners(ctx.context, wc.triggerUpdate);
}
