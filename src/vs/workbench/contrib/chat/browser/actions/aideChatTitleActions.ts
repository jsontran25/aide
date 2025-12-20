/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatViewId } from '../chat.js';

const whenAideChatView = ContextKeyExpr.equals('view', ChatViewId);

// 1) Sync
registerAction2(class AideChatSyncAction extends Action2 {
	constructor() {
		super({
			id: 'aide.chat.sync',
			title: localize2('aide.chat.sync', 'Sync'),
			icon: Codicon.sync,
			menu: {
				id: MenuId.ViewTitle,
				when: whenAideChatView,
				group: 'navigation',
				order: 10,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notifications = accessor.get(INotificationService);
		notifications.info(localize2('aide.chat.sync.stub', 'AIDE: Sync (stub)').value);
	}
});

// 2) Snapshot
registerAction2(class AideChatSnapshotAction extends Action2 {
	constructor() {
		super({
			id: 'aide.chat.snapshot',
			title: localize2('aide.chat.snapshot', 'Snapshot'),
			icon: Codicon.save,
			menu: {
				id: MenuId.ViewTitle,
				when: whenAideChatView,
				group: 'navigation',
				order: 20,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		// TODO: wire to your real snapshot command later.
		// Keep it safe: if command missing, no crash.
		try {
			await commandService.executeCommand('aide.snapshot');
		} catch {
			const notifications = accessor.get(INotificationService);
			notifications.info(localize2('aide.chat.snapshot.stub', 'AIDE: Snapshot (stub)').value);
		}
	}
});

// 3) Open (dropdown hub)
registerAction2(class AideChatOpenHubAction extends Action2 {
	constructor() {
		super({
			id: 'aide.chat.openHub',
			title: localize2('aide.chat.openHub', 'Open'),
			icon: Codicon.folderOpened,
			menu: {
				id: MenuId.ViewTitle,
				when: whenAideChatView,
				group: 'navigation',
				order: 30,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInput = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);

		const pick = await quickInput.pick([
			{ label: 'Roadmap', description: 'Open AIDE roadmap/checklist' },
			{ label: 'Checklist', description: 'Open AIDE_CHECKLIST.md' },
			{ label: 'Todo', description: 'Open AIDE Todo (stub)' },
		], { placeHolder: 'AIDE' });

		if (!pick) {
			return;
		}

		if (pick.label === 'Checklist' || pick.label === 'Roadmap') {
			// Your existing extension commands
			// (adjust IDs if you named them differently)
			try {
				await commandService.executeCommand('aideChecklist.open');
			} catch {
				await commandService.executeCommand('aideChecklist.init');
				await commandService.executeCommand('aideChecklist.open');
			}
			return;
		}

		// Todo stub
		const notifications = accessor.get(INotificationService);
		notifications.info(localize2('aide.chat.todo.stub', 'AIDE: Todo (stub)').value);
	}
});

// 4) Refresh
registerAction2(class AideChatRefreshAction extends Action2 {
	constructor() {
		super({
			id: 'aide.chat.refresh',
			title: localize2('aide.chat.refresh', 'Refresh'),
			icon: Codicon.refresh,
			menu: {
				id: MenuId.ViewTitle,
				when: whenAideChatView,
				group: 'navigation',
				order: 40,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand('workbench.action.reloadWindow');
	}
});
