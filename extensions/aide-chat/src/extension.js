/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const vscode = require('vscode');

const AIDE_DIRNAME = '.aide';
const STATE_FILENAME = 'state.json';

async function getWorkspaceRootUri() {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return null;
	}
	return folders[0].uri;
}

async function readState(rootUri) {
	const stateUri = vscode.Uri.joinPath(rootUri, AIDE_DIRNAME, STATE_FILENAME);
	try {
		const buf = await vscode.workspace.fs.readFile(stateUri);
		const text = new TextDecoder('utf-8').decode(buf);
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function escapeHtml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderHtml(tasks) {
	const items = tasks.map(t => {
		const status = t.status === 'done' ? 'done' : 'todo';
		return `<div class="task ${status}">
			<span class="dot"></span>
			<span class="id">${escapeHtml(t.id)}</span>
			<span class="title">${escapeHtml(t.title || '')}</span>
		</div>`;
	}).join('');

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIDE Chat</title>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; padding: 12px; }
	.hint { opacity: .75; margin: 0 0 10px 0; }
	.tasks { border: 1px solid rgba(127,127,127,.25); border-radius: 10px; padding: 10px; margin-bottom: 12px; }
	.task { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; }
	.dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; margin-top: 6px; }
	.task.todo .dot { background: rgba(127,127,127,.9); }
	.task.done .dot { background: rgba(80,200,120,.95); }
	.id { font-weight: 600; }
	.title { opacity: .9; }
	.box { display: flex; gap: 8px; }
	input { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; }
	button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; cursor: pointer; }
	button:hover { background: rgba(127,127,127,.10); }
</style>
</head>
<body>
	<p class="hint">AIDE Chat UI (engine will be wired later). Use the header buttons for Sync / Snapshot / Open Checklist.</p>

	<div class="tasks">
		<div style="font-weight:600; margin-bottom:8px;">Tasks</div>
		${items || '<div style="opacity:.7;">No tasks found. Run AIDE: Sync Checklist.</div>'}
	</div>

	<div class="box">
		<input id="prompt" placeholder="Describe what to build next..." />
		<button id="send">Send</button>
	</div>

<script>
	const vscode = acquireVsCodeApi();
	const input = document.getElementById('prompt');
	document.getElementById('send').addEventListener('click', () => {
		const text = (input.value || '').trim();
		if (!text) return;
		vscode.postMessage({ type: 'prompt', text });
		input.value = '';
	});
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			document.getElementById('send').click();
		}
	});
</script>
</body>
</html>`;
}

class AideChatViewProvider {
	constructor(context) {
		this._context = context;
		this._view = null;
	}

	resolveWebviewView(view) {
		this._view = view;
		view.webview.options = { enableScripts: true };

		const refresh = async () => {
			const rootUri = await getWorkspaceRootUri();
			const state = rootUri ? await readState(rootUri) : null;
			const tasks = state && state.tasks ? Object.values(state.tasks) : [];
			tasks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
			view.webview.html = renderHtml(tasks);
		};

		void refresh();

		view.webview.onDidReceiveMessage(async (msg) => {
			if (!msg || msg.type !== 'prompt') {
				return;
			}
			// UI-only MVP: store prompt later; for now just notify.
			vscode.window.setStatusBarMessage('AIDE: prompt captured (engine wiring later).', 2500);
		});

		this._disposables = [];
		(async () => {
			const rootUri = await getWorkspaceRootUri();
			if (!rootUri) {
				return;
			}
			const pattern = new vscode.RelativePattern(rootUri, `${AIDE_DIRNAME}/${STATE_FILENAME}`);
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			watcher.onDidChange(() => refresh());
			watcher.onDidCreate(() => refresh());
			watcher.onDidDelete(() => refresh());
			this._context.subscriptions.push(watcher);
		})();
	}

	async focus() {
		if (this._view) {
			this._view.show?.(true);
		}
	}

	async refresh() {
		if (this._view) {
			const rootUri = await getWorkspaceRootUri();
			const state = rootUri ? await readState(rootUri) : null;
			const tasks = state && state.tasks ? Object.values(state.tasks) : [];
			tasks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
			this._view.webview.html = renderHtml(tasks);
		}
	}
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const provider = new AideChatViewProvider(context);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('aideChat.session', provider));

	const focusCmd = vscode.commands.registerCommand('aide.chat.focus', async () => provider.focus());
	const refreshCmd = vscode.commands.registerCommand('aide.chat.refresh', async () => provider.refresh());

	context.subscriptions.push(focusCmd, refreshCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
