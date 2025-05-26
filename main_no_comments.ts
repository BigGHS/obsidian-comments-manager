// main.ts
import { 
	App, 
	Editor, 
	MarkdownView, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	WorkspaceLeaf, 
	ItemView, 
	TFile,
	EditorPosition,
	Notice
} from 'obsidian';

// Plugin settings interface
interface CommentsManagerSettings {
	commentPrefix: string;
	openOnStart: boolean;
}

const DEFAULT_SETTINGS: CommentsManagerSettings = {
	commentPrefix: '%%',
	openOnStart: true
}

// View type constant
export const COMMENTS_VIEW_TYPE = 'comments-manager-view';

// Interface for comment data
interface CommentData {
	text: string;
	line: number;
	startPos: number;
	endPos: number;
	fullMatch: string;
}

export default class CommentsManagerPlugin extends Plugin {
	settings: CommentsManagerSettings;
	private refreshTimeout: number | null = null;
	private skipNextRefresh: boolean = false;

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(
			COMMENTS_VIEW_TYPE,
			(leaf) => new CommentsView(leaf, this)
		);

		// Add ribbon icon to toggle comments panel
		this.addRibbonIcon('message-square', 'Toggle Comments Panel', () => {
			this.activateView();
		});

		// Add command to toggle comments panel
		this.addCommand({
			id: 'toggle-comments-panel',
			name: 'Toggle Comments Panel',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to insert comment
		this.addCommand({
			id: 'insert-comment',
			name: 'Insert comment',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				const comment = `${this.settings.commentPrefix} ${selection || 'Your comment here'} ${this.settings.commentPrefix}`;
				editor.replaceSelection(comment);
				
				// Refresh the comments view
				this.refreshCommentsView();
			}
		});

		// Add settings tab
		this.addSettingTab(new CommentsManagerSettingTab(this.app, this));

		// Listen for file changes to update comments panel
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.refreshCommentsView();
			})
		);

		// Listen for editor changes
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				// Debounce the refresh to avoid too frequent updates
				this.debounceRefresh();
			})
		);

		// Open comments panel on startup if setting is enabled
		if (this.settings.openOnStart) {
			this.app.workspace.onLayoutReady(() => {
				this.activateView();
			});
		}
	}

	debounceRefresh() {
		if (this.skipNextRefresh) {
			return;
		}
		
		if (this.refreshTimeout) {
			window.clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = window.setTimeout(() => {
			this.refreshCommentsView();
		}, 500);
	}

	async activateView() {
		const { workspace } = this.app;
		
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(COMMENTS_VIEW_TYPE);

		if (leaves.length > 0) {
			// If view exists, reveal it
			leaf = leaves[0];
			workspace.revealLeaf(leaf);
		} else {
			// Create new view in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: COMMENTS_VIEW_TYPE, active: true });
			}
		}

		// Refresh the view content
		this.refreshCommentsView();
	}

	refreshCommentsView() {
		const leaves = this.app.workspace.getLeavesOfType(COMMENTS_VIEW_TYPE);
		leaves.forEach(leaf => {
			if (leaf.view instanceof CommentsView) {
				leaf.view.refresh();
			}
		});
	}

	extractComments(content: string): CommentData[] {
		const lines = content.split('\n');
		const comments: CommentData[] = [];
		const commentRegex = new RegExp(`${this.escapeRegex(this.settings.commentPrefix)}(.*?)${this.escapeRegex(this.settings.commentPrefix)}`, 'g');
		
		let currentPos = 0;
		lines.forEach((line, lineIndex) => {
			const lineStartPos = currentPos;
			let match;
			commentRegex.lastIndex = 0; // Reset regex state
			
			while ((match = commentRegex.exec(line)) !== null) {
				comments.push({
					text: match[1].trim(),
					line: lineIndex,
					startPos: lineStartPos + match.index,
					endPos: lineStartPos + match.index + match[0].length,
					fullMatch: match[0]
				});
			}
			currentPos += line.length + 1; // +1 for newline character
		});
		
		return comments;
	}

	escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	highlightCommentInEditor(comment: CommentData) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		// Focus the editor first to ensure it's the active view
		activeView.editor.focus();

		const editor = activeView.editor;
		const content = editor.getValue();
		
		// Convert absolute position to line/ch coordinates
		const lines = content.substring(0, comment.startPos).split('\n');
		const line = lines.length - 1;
		const ch = lines[lines.length - 1].length;
		
		const endLines = content.substring(0, comment.endPos).split('\n');
		const endLine = endLines.length - 1;
		const endCh = endLines[endLines.length - 1].length;

		// Scroll to and select the comment
		editor.scrollIntoView({
			from: { line, ch },
			to: { line: endLine, ch: endCh }
		}, true);

		editor.setSelection(
			{ line, ch },
			{ line: endLine, ch: endCh }
		);

		// Prevent the view from refreshing immediately after highlighting
		this.skipNextRefresh = true;
		setTimeout(() => {
			this.skipNextRefresh = false;
		}, 200);
	}

	onunload() {
		// Cleanup code goes here
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Comments View Class
class CommentsView extends ItemView {
	plugin: CommentsManagerPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: CommentsManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return COMMENTS_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Comments';
	}

	getIcon() {
		return 'message-square';
	}

	async onOpen() {
		this.refresh();
	}

	async onClose() {
		// Nothing to clean up
	}

	refresh() {
		const container = this.containerEl.children[1];
		container.empty();

		// Add header
		const header = container.createEl('div', { cls: 'comments-header' });
		header.createEl('h4', { text: 'Comments', cls: 'comments-title' });

		// Get active file content with a small delay to ensure proper focus
		setTimeout(() => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) {
				container.createEl('div', { 
					text: 'No active markdown file', 
					cls: 'comments-empty' 
				});
				return;
			}

			const content = activeView.editor.getValue();
			const comments = this.plugin.extractComments(content);

			if (comments.length === 0) {
				container.createEl('div', { 
					text: 'No comments found', 
					cls: 'comments-empty' 
				});
				return;
			}

			// Create comments list
			const commentsList = container.createEl('div', { cls: 'comments-list' });

			comments.forEach((comment, index) => {
				const commentEl = commentsList.createEl('div', { cls: 'comment-item' });
				
				// Comment content
				const contentEl = commentEl.createEl('div', { cls: 'comment-content' });
				
				// Editable comment text
				const textEl = contentEl.createEl('div', { 
					cls: 'comment-text',
					attr: { contenteditable: 'true', spellcheck: 'false' }
				});
				textEl.textContent = comment.text || '(empty comment)';
				
				// Line number (not editable)
				const lineEl = contentEl.createEl('div', { 
					text: `Line ${comment.line + 1}`, 
					cls: 'comment-line' 
				});

				// Action buttons container
				const actionsEl = commentEl.createEl('div', { cls: 'comment-actions' });
				
				// Save button (initially hidden)
				const saveBtn = actionsEl.createEl('button', { 
					text: 'Save', 
					cls: 'comment-btn comment-save-btn' 
				});
				saveBtn.style.display = 'none';
				
				// Cancel button (initially hidden)
				const cancelBtn = actionsEl.createEl('button', { 
					text: 'Cancel', 
					cls: 'comment-btn comment-cancel-btn' 
				});
				cancelBtn.style.display = 'none';

				// Delete button
				const deleteBtn = actionsEl.createEl('button', { 
					text: '×', 
					cls: 'comment-btn comment-delete-btn',
					attr: { title: 'Delete comment' }
				});

				let originalText = comment.text;
				let isEditing = false;

				// Handle text editing
				textEl.addEventListener('input', () => {
					if (!isEditing) {
						isEditing = true;
						saveBtn.style.display = 'inline-block';
						cancelBtn.style.display = 'inline-block';
						deleteBtn.style.display = 'none';
						commentEl.addClass('comment-editing');
					}
				});

				// Handle keyboard shortcuts in edit mode
				textEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						saveComment();
					} else if (e.key === 'Escape') {
						e.preventDefault();
						cancelEdit();
					}
				});

				// Save comment function
				const saveComment = () => {
					const newText = textEl.textContent?.trim() || '';
					if (newText !== originalText) {
						this.updateCommentInEditor(comment, newText);
						originalText = newText;
					}
					exitEditMode();
				};

				// Cancel edit function
				const cancelEdit = () => {
					textEl.textContent = originalText;
					exitEditMode();
				};

				// Exit edit mode function
				const exitEditMode = () => {
					isEditing = false;
					saveBtn.style.display = 'none';
					cancelBtn.style.display = 'none';
					deleteBtn.style.display = 'inline-block';
					commentEl.removeClass('comment-editing');
					textEl.blur();
				};

				// Button event listeners
				saveBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					saveComment();
				});

				cancelBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					cancelEdit();
				});

				deleteBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.deleteCommentFromEditor(comment);
				});

				// Make the comment clickable (only when not editing)
				commentEl.addEventListener('click', (e) => {
					if (!isEditing && (e.target === commentEl || e.target === contentEl || e.target === lineEl)) {
						this.plugin.highlightCommentInEditor(comment);
					}
				});

				// Add hover effect (only when not editing)
				commentEl.addEventListener('mouseenter', () => {
					if (!isEditing) {
						commentEl.addClass('comment-item-hover');
					}
				});

				commentEl.addEventListener('mouseleave', () => {
					commentEl.removeClass('comment-item-hover');
				});
			});

			// Add custom CSS
			this.addStyles();
		}, 10); // Small delay to ensure proper view state
	}

	updateCommentInEditor(comment: CommentData, newText: string) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		const content = editor.getValue();
		
		// Find the exact comment in the document
		const beforeComment = content.substring(0, comment.startPos);
		const afterComment = content.substring(comment.endPos);
		
		// Create the new comment with the updated text
		const newComment = `${this.plugin.settings.commentPrefix} ${newText} ${this.plugin.settings.commentPrefix}`;
		
		// Replace the content
		const newContent = beforeComment + newComment + afterComment;
		editor.setValue(newContent);
		
		// Show success message
		new Notice('Comment updated');
		
		// Refresh the view after a short delay to get updated positions
		setTimeout(() => {
			this.refresh();
		}, 100);
	}

	deleteCommentFromEditor(comment: CommentData) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		const content = editor.getValue();
		
		// Find the exact comment in the document
		const beforeComment = content.substring(0, comment.startPos);
		const afterComment = content.substring(comment.endPos);
		
		// Remove the comment (and any adjacent whitespace)
		let newContent = beforeComment + afterComment;
		
		// Clean up any double spaces or line breaks left behind
		newContent = newContent.replace(/\s{2,}/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n');
		
		editor.setValue(newContent);
		
		// Show success message
		new Notice('Comment deleted');
		
		// Refresh the view
		this.refresh();
	}

	addStyles() {
		// Only add styles once
		if (document.getElementById('comments-manager-styles')) return;

		const style = document.createElement('style');
		style.id = 'comments-manager-styles';
		style.textContent = `
			.comments-header {
				padding: 10px;
				border-bottom: 1px solid var(--background-modifier-border);
			}

			.comments-title {
				margin: 0;
				color: var(--text-normal);
			}

			.comments-empty {
				padding: 20px;
				text-align: center;
				color: var(--text-muted);
				font-style: italic;
			}

			.comments-list {
				padding: 5px;
			}

			.comment-item {
				padding: 8px 12px;
				margin: 2px 0;
				border-radius: 4px;
				cursor: pointer;
				border: 1px solid transparent;
				transition: all 0.1s ease;
				position: relative;
			}

			.comment-item:hover:not(.comment-editing),
			.comment-item-hover {
				background-color: var(--background-modifier-hover);
				border-color: var(--background-modifier-border);
			}

			.comment-item.comment-editing {
				background-color: var(--background-modifier-form-field);
				border-color: var(--interactive-accent);
				cursor: default;
			}

			.comment-content {
				line-height: 1.4;
				margin-bottom: 8px;
			}

			.comment-text {
				color: var(--text-normal);
				font-size: 14px;
				margin-bottom: 4px;
				word-wrap: break-word;
				border-radius: 3px;
				padding: 2px 4px;
				min-height: 20px;
			}

			.comment-text[contenteditable="true"]:focus {
				outline: 1px solid var(--interactive-accent);
				background-color: var(--background-primary);
			}

			.comment-line {
				color: var(--text-muted);
				font-size: 12px;
			}

			.comment-actions {
				display: flex;
				gap: 4px;
				justify-content: flex-end;
				margin-top: 4px;
			}

			.comment-btn {
				padding: 2px 8px;
				font-size: 11px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 3px;
				cursor: pointer;
				transition: all 0.1s ease;
			}

			.comment-save-btn {
				background-color: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}

			.comment-save-btn:hover {
				background-color: var(--interactive-accent-hover);
			}

			.comment-cancel-btn {
				background-color: var(--background-secondary);
				color: var(--text-normal);
			}

			.comment-cancel-btn:hover {
				background-color: var(--background-modifier-hover);
			}

			.comment-delete-btn {
				background-color: var(--background-secondary);
				color: var(--text-error);
				border-color: var(--background-modifier-border);
				font-weight: bold;
				width: 20px;
				height: 20px;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
			}

			.comment-delete-btn:hover {
				background-color: var(--background-modifier-error);
				border-color: var(--text-error);
			}
		`;
		document.head.appendChild(style);
	}
}

// Settings tab class
class CommentsManagerSettingTab extends PluginSettingTab {
	plugin: CommentsManagerPlugin;

	constructor(app: App, plugin: CommentsManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Comments Manager Settings' });

		new Setting(containerEl)
			.setName('Comment prefix')
			.setDesc('The characters used to mark comments (e.g., %% for Obsidian comments)')
			.addText(text => text
				.setPlaceholder('%%')
				.setValue(this.plugin.settings.commentPrefix)
				.onChange(async (value) => {
					this.plugin.settings.commentPrefix = value || '%%';
					await this.plugin.saveSettings();
					this.plugin.refreshCommentsView();
				}));

		new Setting(containerEl)
			.setName('Open panel on startup')
			.setDesc('Automatically open the comments panel when Obsidian starts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.openOnStart)
				.onChange(async (value) => {
					this.plugin.settings.openOnStart = value;
					await this.plugin.saveSettings();
				}));
	}
}