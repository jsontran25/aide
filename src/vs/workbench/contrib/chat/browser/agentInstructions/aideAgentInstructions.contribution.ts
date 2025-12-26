/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) AIDE.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import type { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';

import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';

const TARGET_RELATIVE = ['.github', 'aide-instructions.md'] as const;

function defaultTemplate(): string {
	return getAideAgentInstructionsTemplateV1();
}

async function ensureEnabled(configurationService: IConfigurationService): Promise<void> {
	// Best-effort: b\u1EADt workspace scope \u0111\u1EC3 repo hi\u1EC7n t\u1EA1i pick up ngay
	try {
		const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
		const props = configurationRegistry.getConfigurationProperties();
		if (!props[PromptsConfig.USE_AIDE_INSTRUCTION_FILES]) {
			// Ch\u01B0a register setting => \u0111\u1EEBng updateValue \u0111\u1EC3 tr\u00E1nh toast l\u1ED7i
			return;
		}
		await configurationService.updateValue(PromptsConfig.USE_AIDE_INSTRUCTION_FILES, true, ConfigurationTarget.WORKSPACE);
	} catch {
		// ignore
	}
}

class GenerateAgentInstructionsAction extends Action2 {
	constructor() {
		super({
			id: 'aide.generateAgentInstructions',
			title: localize2('aide.generateAgentInstructions', 'Generate Agent Instructions'),
			category: localize2('aide.category', 'AIDE'),
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const fileService = accessor.get(IFileService);
		const editorService = accessor.get(IEditorService);
		const configurationService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		const folders = workspaceContextService.getWorkspace().folders;
		if (!folders.length) {
			notificationService.notify({
				severity: Severity.Info,
				message: localize('aide.noWorkspace', 'Open a folder/workspace first to generate agent instructions.')
			});
			return;
		}

		const root = folders[0].uri;
		const target = joinPath(root, ...TARGET_RELATIVE);
		const parent = joinPath(root, TARGET_RELATIVE[0]);

		const exists = await fileService.exists(target);
		try {
			await fileService.createFolder(parent);

			await upsertAideInstructionsFile(fileService, target);

			await ensureEnabled(configurationService);
			await editorService.openEditor({ resource: target });

			notificationService.notify({
				severity: Severity.Info,
				message: exists
					? localize('aide.instructionsOpened', 'Opened existing agent instructions.')
					: localize('aide.instructionsCreated', 'Created agent instructions.')
			});
		} catch (err) {
			console.error(err);
			notificationService.notify({
				severity: Severity.Error,
				message: localize('aide.instructionsFailed', 'Failed to generate agent instructions. {0}', String(err)),
			});
		}
	}
}

registerAction2(GenerateAgentInstructionsAction);

function getAideAgentInstructionsTemplateV1(): string {
	return [
		'# AIDE Agent Instructions',
		'<!-- AIDE:templateVersion=1 -->',
		'',
		'Use this file to tell AIDE how to work in this repository.',
		'Keep it short, concrete, and actionable.',
		'',
		'## Project overview',
		'<!-- AIDE:BEGIN Project overview -->',
		'- What this repo does',
		'- Key folders/modules',
		'<!-- AIDE:END Project overview -->',
		'',
		'## Build & run',
		'<!-- AIDE:BEGIN Build & run -->',
		'- Install deps: `npm ci`',
		'- Dev: `npm run watch`',
		'- Test: `npm test`',
		'<!-- AIDE:END Build & run -->',
		'',
		'## Coding conventions',
		'<!-- AIDE:BEGIN Coding conventions -->',
		'- Prefer existing patterns in the codebase',
		'- Keep changes minimal and consistent',
		'- Avoid breaking UI; keep behavior backward compatible',
		'- Add tests when behavior changes',
		'<!-- AIDE:END Coding conventions -->',
		'',
	].join('\n');
}

async function upsertAideInstructionsFile(fileService: IFileService, instructionsUri: URI): Promise<void> {
	const template = defaultTemplate();
	const exists = await fileService.exists(instructionsUri);
	if (!exists) {
		await fileService.writeFile(instructionsUri, VSBuffer.fromString(template));
		return;
	}

	const existing = (await fileService.readFile(instructionsUri)).value.toString();
	const merged = mergeAideAgentInstructions(existing, template);
	if (merged !== existing) {
		await fileService.writeFile(instructionsUri, VSBuffer.fromString(merged));
	}
}

function mergeAideAgentInstructions(existing: string, template: string): string {
	// Only upsert/refresh if the file is already marker-based
	if (!existing.includes('<!-- AIDE:BEGIN') || !existing.includes('<!-- AIDE:END')) {
		return existing;
	}

	const blocks = extractAideBlocks(template);
	let out = existing;

	for (const [name, block] of blocks) {
		const begin = `<!-- AIDE:BEGIN ${name} -->`;
		const end = `<!-- AIDE:END ${name} -->`;

		// Preserve user content: only add missing sections, never overwrite existing blocks.
		if (out.includes(begin) && out.includes(end)) {
			continue;
		}

		out = out.replace(/\s*$/, '') + '\n\n' + block + '\n';
	}

	return out;
}

function extractAideBlocks(text: string): Array<[string, string]> {
	const blocks: Array<[string, string]> = [];
	const re = /<!-- AIDE:BEGIN ([^>]+) -->[\s\S]*?<!-- AIDE:END \1 -->/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		blocks.push([m[1], m[0]]);
	}
	return blocks;
}

