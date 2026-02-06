import { vi } from 'vitest';
import * as vscode from './mocks/vscode';

vi.mock('vscode', () => vscode);
