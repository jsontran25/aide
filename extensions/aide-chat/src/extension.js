/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const vscode = require('vscode');

const AIDE_DIRNAME = '.aide';
const STATE_FILENAME = 'state.json';
const SNAPSHOTS_DIRNAME = 'snapshots';
const CHECKLIST_FILENAME = 'AIDE_CHECKLIST.md';

async function getWorkspaceRootUri() {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return null;
	}
	return folders[0].uri;
}

async function readJson(uri) {
	try {
		const buf = await vscode.workspace.fs.readFile(uri);
		const text = new TextDecoder('utf-8').decode(buf);
		return JSON.parse(text);
	} catch {
		return null;
	}
}

async function readText(uri) {
	try {
		const buf = await vscode.workspace.fs.readFile(uri);
		return new TextDecoder('utf-8').decode(buf);
	} catch {
		return null;
	}
}

async function listSnapshots(rootUri) {
	const dirUri = vscode.Uri.joinPath(rootUri, AIDE_DIRNAME, SNAPSHOTS_DIRNAME);
	try {
		const entries = await vscode.workspace.fs.readDirectory(dirUri);
		return entries
			.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
			.map(([name]) => name)
			.sort()
			.reverse()
			.slice(0, 30);
	} catch {
		return [];
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

function renderHtml(payload) {
	const title = payload.title || 'AIDE';
	const hint = payload.hint || '';
	const body = payload.bodyHtml || '';

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; padding: 12px; }
	.hint { opacity: .75; margin: 0 0 12px 0; }
	.card { border: 1px solid rgba(127,127,127,.25); border-radius: 10px; padding: 10px; margin-bottom: 12px; }
	.row { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; }
	.dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; margin-top: 6px; }
	.dot.todo { background: rgba(127,127,127,.9); }
	.dot.done { background: rgba(80,200,120,.95); }
	.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
	.box { display: flex; gap: 8px; }
	input { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; }
	button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; cursor: pointer; }
	button:hover { background: rgba(127,127,127,.10); }
</style>
</head>
<body>
	<p class="hint">${escapeHtml(hint)}</p>
	${body}
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
		this._ctxId = this._context.globalState.get('aide.chat.context', 'checklist');
	}

	async _buildPayload() {
		const rootUri = await getWorkspaceRootUri();
		if (!rootUri) {
			return {
				title: 'AIDE',
				hint: 'Open a folder/workspace to use AIDE Chat.',
				bodyHtml: '<div class="card">No workspace opened.</div>'
			};
		}

		const stateUri = vscode.Uri.joinPath(rootUri, AIDE_DIRNAME, STATE_FILENAME);
		const state = await readJson(stateUri);
		const tasks = state && state.tasks ? Object.values(state.tasks) : [];
		tasks.sort((a, b) => String(a.id).localeCompare(String(b.id)));

		if (this._ctxId === 'todos') {
			const todos = tasks.filter(t => t.status !== 'done');
			const items = todos.map(t => `<div class="row"><span class="dot todo"></span><span class="mono">${escapeHtml(t.id)}</span><span>${escapeHtml(t.title || '')}</span></div>`).join('');
			return {
				title: 'AIDE',
				hint: 'Context: Todos',
				bodyHtml: `<div class="card"><div style="font-weight:600;margin-bottom:8px;">Todos</div>${items || '<div style="opacity:.7;">No todos. Sync first.</div>'}</div>`
			};
		}

		if (this._ctxId === 'snapshots') {
			const snaps = await listSnapshots(rootUri);
			const items = snaps.map(name => `<div class="row"><span class="mono">${escapeHtml(name)}</span></div>`).join('');
			return {
				title: 'AIDE',
				hint: 'Context: Snapshots',
				bodyHtml: `<div class="card"><div style="font-weight:600;margin-bottom:8px;">Snapshots</div>${items || '<div style="opacity:.7;">No snapshots yet.</div>'}</div>`
			};
		}

		if (this._ctxId === 'roadmap') {
			const checklistUri = vscode.Uri.joinPath(rootUri, CHECKLIST_FILENAME);
			const text = await readText(checklistUri);
			return {
				title: 'AIDE',
				hint: 'Context: Roadmap (source: AIDE_CHECKLIST.md)',
				bodyHtml: `<div class="card"><div style="font-weight:600;margin-bottom:8px;">Roadmap</div><div style="opacity:.85; white-space:pre-wrap;">${escapeHtml(text || 'Missing AIDE_CHECKLIST.md. Run AIDE: Init Checklist.')}</div></div>`
			};
		}

		// default: checklist
		const items = tasks.map(t => {
			const done = t.status === 'done';
			return `<div class="row"><span class="dot ${done ? 'done' : 'todo'}"></span><span class="mono">${escapeHtml(t.id)}</span><span>${escapeHtml(t.title || '')}</span></div>`;
		}).join('');

		return {
			title: 'AIDE',
			hint: 'Context: Checklist',
			bodyHtml: `<div class="card"><div style="font-weight:600;margin-bottom:8px;">Tasks</div>${items || '<div style="opacity:.7;">No tasks found. Sync first.</div>'}</div>`
		};
	}

	async _render() {
		if (!this._view) {
			return;
		}
		const payload = await this._buildPayload();
		this._view.webview.html = renderHtml(payload);
	}

	resolveWebviewView(view) {
		this._view = view;
		view.webview.options = { enableScripts: true };
		void this._render();

		view.webview.onDidReceiveMessage(async (msg) => {
			if (!msg || msg.type !== 'prompt') {
				return;
			}
			vscode.window.setStatusBarMessage('AIDE: prompt captured (engine wiring later).', 2500);
		});

		(async () => {
			const rootUri = await getWorkspaceRootUri();
			if (!rootUri) {
				return;
			}
			const pattern = new vscode.RelativePattern(rootUri, `${AIDE_DIRNAME}/${STATE_FILENAME}`);
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			watcher.onDidChange(() => this._render());
			watcher.onDidCreate(() => this._render());
			watcher.onDidDelete(() => this._render());
			this._context.subscriptions.push(watcher);
		})();
	}

	async refresh() {
		await this._render();
	}

	async setContext(ctxId) {
		this._ctxId = ctxId;
		await this._context.globalState.update('aide.chat.context', ctxId);
		await this._render();
	}
}

async function placeChatOnRightFirstRun(context) {
	const cfg = vscode.workspace.getConfiguration('aide.chat');
	if (!cfg.get('defaultRightSide', true)) {
		return;
	}
	const key = 'aide.chat.didPlaceRight';
	if (context.globalState.get(key)) {
		return;
	}

	// Best-effort (temporary). Core-level placement comes next.
	try { await vscode.commands.executeCommand('workbench.view.extension.aideChat'); } catch {}
	try { await vscode.commands.executeCommand('workbench.action.moveViewToSecondarySideBar'); } catch {}

	await context.globalState.update(key, true);
}

function activate(context) {
	const provider = new AideChatViewProvider(context);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('aideChat.session', provider));

	// Toolbar actions calling aide-checklist built-in commands.
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.sync', async () => {
		try { await vscode.commands.executeCommand('aide.checklist.sync'); } finally { await provider.refresh(); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.snapshot', async () => {
		try { await vscode.commands.executeCommand('aide.checklist.snapshot'); } finally { await provider.refresh(); }
	}));
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.openChecklist', async () => {
		await vscode.commands.executeCommand('aide.checklist.open');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.refresh', async () => provider.refresh()));

	// Context submenu commands (dropdown in header)
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.context.roadmap', async () => provider.setContext('roadmap')));
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.context.checklist', async () => provider.setContext('checklist')));
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.context.todos', async () => provider.setContext('todos')));
	context.subscriptions.push(vscode.commands.registerCommand('aide.chat.context.snapshots', async () => provider.setContext('snapshots')));

	void placeChatOnRightFirstRun(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
