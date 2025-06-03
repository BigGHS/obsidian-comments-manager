// main.ts - Beta version with Print Mode functionality
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
	Notice,
	Modal
} from 'obsidian';

// Plugin settings interface
interface CommentsManagerSettings {
	commentPrefix: string;
	openOnStart: boolean;
	debugMode: boolean;
	defaultCollapsed: boolean;
	// Print Mode settings
	printModeCalloutType: string;
	includeCommentAuthor: boolean;
	includeCommentTimestamp: boolean;
}

const DEFAULT_SETTINGS: CommentsManagerSettings = {
	commentPrefix: '%%',
	openOnStart: true,
	debugMode: false,
	defaultCollapsed: true,
	// Print Mode defaults
	printModeCalloutType: 'comment',
	includeCommentAuthor: false,
	includeCommentTimestamp: false
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

// Interface for header data
interface HeaderData {
	text: string;
	level: number;
	line: number;
}

// Interface for grouped comments
interface CommentGroup {
	header: HeaderData | null;
	comments: CommentData[];
	children?: CommentGroup[];
	parent?: CommentGroup;
	isCollapsed?: boolean;
}

// Interface for tracking rendered groups
interface RenderedGroup {
	group: CommentGroup;
	collapseIcon: Element;
	contentElement: HTMLElement;
}

// Print Mode Preview Modal
class PrintModePreviewModal extends Modal {
	plugin: CommentsManagerPlugin;
	originalContent: string;
	convertedContent: string;
	activeView: MarkdownView; // Store the active view reference
	
	constructor(app: App, plugin: CommentsManagerPlugin, originalContent: string, convertedContent: string, activeView: MarkdownView) {
		super(app);
		this.plugin = plugin;
		this.originalContent = originalContent;
		this.convertedContent = convertedContent;
		this.activeView = activeView; // Store the view reference
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Title
		contentEl.createEl('h2', { text: 'Print Mode Preview' });

		// Description
		const desc = contentEl.createEl('p', { cls: 'print-mode-description' });
		desc.innerHTML = 'This preview shows how your document will look with comments converted to callouts for printing/PDF export. The original document will not be modified.';

		// Content preview (scrollable)
		const previewContainer = contentEl.createEl('div', { cls: 'print-mode-preview-container' });
		const previewEl = previewContainer.createEl('pre', { cls: 'print-mode-preview' });
		previewEl.textContent = this.convertedContent;

		// Buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'print-mode-buttons' });
		
		const exportBtn = buttonContainer.createEl('button', { 
			text: 'Export to PDF', 
			cls: 'mod-cta'
		});
		
		const copyBtn = buttonContainer.createEl('button', { 
			text: 'Copy Content'
		});
		
		const cancelBtn = buttonContainer.createEl('button', { 
			text: 'Cancel'
		});

		// Button handlers
		exportBtn.onclick = () => {
			this.triggerPDFExport();
		};

		copyBtn.onclick = () => {
			navigator.clipboard.writeText(this.convertedContent);
			new Notice('Converted content copied to clipboard');
		};

		cancelBtn.onclick = () => {
			this.close();
		};
	}

	async triggerPDFExport() {
			if (!this.activeView) {
				new Notice('No active markdown view available');
				return;
			}

			const editor = this.activeView.editor;
			if (!editor) {
				new Notice('Editor is no longer available');
				return;
			}
		
			const originalContent = editor.getValue();
		
			try {
				// Close modal first
				this.close();
				await new Promise(resolve => setTimeout(resolve, 200));
			
				// Focus the editor
				this.activeView.editor.focus();
			
				// Set converted content
				editor.setValue(this.convertedContent);
				editor.refresh();
			
				// Give time for rendering
				await new Promise(resolve => setTimeout(resolve, 800));
			
				// Create a notice with restore function
				const restoreContent = () => {
					editor.setValue(originalContent);
					editor.refresh();
					new Notice('Original content restored');
				};
			
				// Show persistent notice with restore option
				const notice = new Notice('Document converted to callouts! Now use Ctrl+P or File → Export to PDF. Click here when done to restore original content.', 0);
				notice.noticeEl.style.cursor = 'pointer';
				notice.noticeEl.addEventListener('click', () => {
					restoreContent();
					notice.hide();
				});
			
				// Also add a command to restore content
				const restoreCommand = this.plugin.addCommand({
					id: 'restore-original-content',
					name: 'Restore Original Content (after Print Mode)',
					callback: () => {
						restoreContent();
						notice.hide();
						// Remove this temporary command
						(this.plugin as any).removeCommand('restore-original-content');
					}
				});
			
			} catch (error) {
				console.error('Error during PDF export preparation:', error);
				new Notice('Error preparing for PDF export: ' + error.message);
				// Restore content on error
				try {
					editor.setValue(originalContent);
					editor.refresh();
				} catch (restoreError) {
					console.error('Error restoring content:', restoreError);
				}
			}
		}
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
// Comment Conversion Modal
class CommentConversionModal extends Modal {
	comment: CommentData;
	onConfirm: (customTitle: string) => void;
	
	constructor(app: App, comment: CommentData, onConfirm: (customTitle: string) => void) {
		super(app);
		this.comment = comment;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Title
		contentEl.createEl('h2', { text: 'Convert Comment to Callout' });

		// Comment preview
		const previewContainer = contentEl.createEl('div', { cls: 'conversion-modal-preview' });
		previewContainer.createEl('h4', { text: 'Comment:' });
		const commentPreview = previewContainer.createEl('div', { cls: 'conversion-modal-comment' });
		commentPreview.textContent = this.comment.text.length > 200 ? 
			this.comment.text.substring(0, 200) + '...' : 
			this.comment.text;

		// Custom title input
		const titleContainer = contentEl.createEl('div', { cls: 'conversion-modal-title-container' });
		titleContainer.createEl('label', { 
			text: 'Callout Title (leave blank for "Comment"):',
			cls: 'conversion-modal-label'
		});
		
		const titleInput = titleContainer.createEl('input', {
			type: 'text',
			cls: 'conversion-modal-input',
			attr: { 
				placeholder: 'e.g., "Important Note", "Question", "Suggestion"...',
				spellcheck: 'false'
			}
		});

		// Info text
		const infoEl = contentEl.createEl('p', { cls: 'conversion-modal-info' });
		infoEl.innerHTML = '<strong>Note:</strong> This will permanently replace the comment with a visible callout. This action cannot be undone.';

		// Buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'conversion-modal-buttons' });
		
		const convertBtn = buttonContainer.createEl('button', { 
			text: 'Convert to Callout', 
			cls: 'mod-cta'
		});
		
		const cancelBtn = buttonContainer.createEl('button', { 
			text: 'Cancel'
		});

		// Event handlers
		convertBtn.onclick = () => {
			const customTitle = titleInput.value.trim();
			this.onConfirm(customTitle);
			this.close();
		};

		cancelBtn.onclick = () => {
			this.close();
		};

		// Handle Enter key in input
		titleInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				convertBtn.click();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				cancelBtn.click();
			}
		});

		// Focus the input field
		setTimeout(() => titleInput.focus(), 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class CommentsManagerPlugin extends Plugin {
	settings: CommentsManagerSettings;
	private refreshTimeout: number | null = null;
	public skipNextRefresh: boolean = false;
	private allHeaders: HeaderData[] = [];

	private debug(message: string, ...args: any[]) {
		if (this.settings.debugMode) {
			console.log(`[Comments Manager] ${message}`, ...args);
		}
	}

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(
			COMMENTS_VIEW_TYPE,
			(leaf) => new CommentsView(leaf, this)
		);

		// Add ribbon icon to toggle comments panel
		this.addRibbonIcon('percent', 'Toggle Comments Panel', () => {
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

		// Add Print Mode command
		this.addCommand({
			id: 'activate-print-mode',
			name: 'Activate Print Mode (Convert Comments to Callouts)',
			callback: () => {
				this.activatePrintMode();
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

	activatePrintMode() {
			// Use the same robust view detection logic as the comments panel
			let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			let currentFile = this.app.workspace.getActiveFile();
		
			this.debug('Print Mode - Active view:', !!activeView, 'Current file:', !!currentFile);
		
			// If no active view but we have a current file, try to find the view for that file
			if (!activeView && currentFile) {
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					if (view.file === currentFile) {
						activeView = view;
						this.debug('Found view for current file in Print Mode');
						break;
					}
				}
			}
		
			// Also check the comments view's stored current file
			const commentsLeaves = this.app.workspace.getLeavesOfType(COMMENTS_VIEW_TYPE);
			if (!activeView && commentsLeaves.length > 0) {
				const commentsView = commentsLeaves[0].view as CommentsView;
				if ((commentsView as any).currentFile) {
					currentFile = (commentsView as any).currentFile;
					this.debug('Using stored current file from comments view');
				
					// Try to find the view for this stored file
					const leaves = this.app.workspace.getLeavesOfType('markdown');
					for (const leaf of leaves) {
						const view = leaf.view as MarkdownView;
						if (view.file === currentFile) {
							activeView = view;
							this.debug('Found view for stored file in Print Mode');
							break;
						}
					}
				}
			}

			if (!activeView) {
				new Notice('No active markdown file found. Please open a markdown file first.');
				return;
			}

			const content = activeView.editor.getValue();
		
			if (!content || content.trim().length === 0) {
				new Notice('The current file is empty');
				return;
			}
		
			const convertedContent = this.convertCommentsToCallouts(content);
		
			if (convertedContent === content) {
				new Notice('No comments found to convert');
				return;
			}

			// Show preview modal - pass the activeView reference
			new PrintModePreviewModal(this.app, this, content, convertedContent, activeView).open();
		}
	convertCommentsToCallouts(content: string): string {
		const comments = this.extractComments(content);
		const headers = this.extractHeaders(content);
		
		if (comments.length === 0) {
			return content;
		}

		// Work backwards through comments to maintain position integrity
		let result = content;
		const sortedComments = [...comments].sort((a, b) => b.startPos - a.startPos);
		
		for (const comment of sortedComments) {
			const callout = this.createCalloutFromComment(comment, headers);
			
			// Replace comment with callout
			const before = result.substring(0, comment.startPos);
			const after = result.substring(comment.endPos);
			
			// Insert callout at the comment position
			result = before + callout + after;
		}

		return result;
	}

	private createCalloutFromComment(comment: CommentData, headers: HeaderData[]): string {
		const calloutType = this.settings.printModeCalloutType;
		
		// Find the nearest header for context
		let nearestHeader: HeaderData | null = null;
		for (let i = headers.length - 1; i >= 0; i--) {
			if (headers[i].line < comment.line) {
				nearestHeader = headers[i];
				break;
			}
		}

		// Create callout title
		let title = 'Comment';
		if (nearestHeader) {
			title = `Comment: ${nearestHeader.text}`;
		}

		// Add line number for reference
		title += ` (Line ${comment.line + 1})`;

		// Format comment text for callout (escape any markdown that might interfere)
		const commentText = comment.text
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0)
			.join('\n> ');

		// Create the callout
		let callout = `\n> [!${calloutType}]+ ${title}\n> ${commentText}\n`;

		return callout;
	}

	debounceRefresh() {
		this.debug('debounceRefresh called, skipNextRefresh:', this.skipNextRefresh);
		
		if (this.skipNextRefresh) {
			this.debug('Skipping refresh due to skipNextRefresh flag');
			this.skipNextRefresh = false;
			return;
		}
		
		if (this.refreshTimeout) {
			window.clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = window.setTimeout(() => {
			this.debug('Executing delayed refresh');
			this.refreshCommentsView();
		}, 500);
	}

	async activateView() {
		const { workspace } = this.app;
		
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(COMMENTS_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
			workspace.revealLeaf(leaf);
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: COMMENTS_VIEW_TYPE, active: true });
			}
		}

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
		const comments: CommentData[] = [];
		const prefix = this.escapeRegex(this.settings.commentPrefix);
		
		const commentRegex = new RegExp(`${prefix}(.*?)${prefix}`, 'gs');
		
		let match;
		while ((match = commentRegex.exec(content)) !== null) {
			const startPos = match.index;
			const endPos = match.index + match[0].length;
			const commentText = match[1].trim();
			
			const beforeComment = content.substring(0, startPos);
			const startLine = (beforeComment.match(/\n/g) || []).length;
			
			comments.push({
				text: commentText,
				line: startLine,
				startPos: startPos,
				endPos: endPos,
				fullMatch: match[0]
			});
		}
		
		return comments;
	}

	extractHeaders(content: string): HeaderData[] {
		const lines = content.split('\n');
		const headers: HeaderData[] = [];
		const headerRegex = /^(#{1,6})\s+(.+)$/;
		
		lines.forEach((line: string, lineIndex: number) => {
			const match = headerRegex.exec(line.trim());
			if (match) {
				headers.push({
					text: match[2].trim(),
					level: match[1].length,
					line: lineIndex
				});
			}
		});
		
		return headers;
	}

	groupCommentsByHeaders(comments: CommentData[], headers: HeaderData[]): CommentGroup[] {
		this.allHeaders = headers;
		
		const groups: CommentGroup[] = [];
		const sortedHeaders = [...headers].sort((a, b) => a.line - b.line);
		
		comments.forEach(comment => {
			let nearestHeader: HeaderData | null = null;
			
			for (let i = sortedHeaders.length - 1; i >= 0; i--) {
				if (sortedHeaders[i].line < comment.line) {
					nearestHeader = sortedHeaders[i];
					break;
				}
			}
			
			let group = groups.find(g => 
				(g.header === null && nearestHeader === null) ||
				(g.header !== null && nearestHeader !== null && g.header.line === nearestHeader.line)
			);
			
			if (!group) {
				group = {
					header: nearestHeader,
					comments: []
				};
				groups.push(group);
			}
			
			group.comments.push(comment);
		});
		
		groups.sort((a, b) => {
			if (a.header === null && b.header === null) return 0;
			if (a.header === null) return -1;
			if (b.header === null) return 1;
			return a.header.line - b.header.line;
		});
		
		return this.buildHierarchicalGroups(groups);
	}

	private buildHierarchicalGroups(flatGroups: CommentGroup[]): CommentGroup[] {
		const commentGroupsByHeaderLine = new Map<number, CommentGroup>();
		let noHeaderGroup: CommentGroup | null = null;
		
		flatGroups.forEach((group: CommentGroup) => {
			if (group.header) {
				commentGroupsByHeaderLine.set(group.header.line, group);
			} else {
				noHeaderGroup = group;
			}
		});
		
		const allGroups: CommentGroup[] = [];
		
		if (noHeaderGroup) {
			allGroups.push(noHeaderGroup);
		}
		
		const sortedHeaders = this.allHeaders.sort((a: HeaderData, b: HeaderData) => a.line - b.line);
		
		sortedHeaders.forEach((header: HeaderData) => {
			const existingGroup = commentGroupsByHeaderLine.get(header.line);
			if (existingGroup) {
				allGroups.push(existingGroup);
			} else {
				allGroups.push({
					header: header,
					comments: []
				});
			}
		});
		
		const result: CommentGroup[] = [];
		const stack: CommentGroup[] = [];
		
		for (const group of allGroups) {
			if (!group.header) {
				result.push(group);
				continue;
			}
			
			while (stack.length > 0 && stack[stack.length - 1].header!.level >= group.header.level) {
				stack.pop();
			}
			
			if (stack.length > 0) {
				const parent = stack[stack.length - 1];
				if (!parent.children) {
					parent.children = [];
				}
				parent.children.push(group);
				group.parent = parent;
			} else {
				result.push(group);
			}
			
			stack.push(group);
		}
		
		return result;
	}
	
	private hasDescendantComments(header: HeaderData, commentGroupsByHeaderLine: Map<number, CommentGroup>): boolean {
		return this.allHeaders.some(otherHeader => 
			otherHeader.line > header.line && 
			otherHeader.level > header.level &&
			commentGroupsByHeaderLine.has(otherHeader.line)
		);
	}

	escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	highlightCommentInEditor(comment: CommentData) {
		this.debug('highlightCommentInEditor called', comment);

		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice('No active markdown file');
			return;
		}

		this.app.workspace.getLeaf().openFile(file).then(() => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return;

			const editor = activeView.editor;
			const content = editor.getValue();
			const comments = this.extractComments(content);
			
			let match = comments.find(c => 
				c.text === comment.text && 
				c.line === comment.line && 
				c.startPos === comment.startPos
			);
			
			if (!match) {
				match = comments.find(c => 
					c.text === comment.text && 
					Math.abs(c.line - comment.line) <= 2
				);
			}
			
			const target = match || comment;
			
			this.debug('Found target comment:', target);

			const beforeComment = content.substring(0, target.startPos);
			const startLine = (beforeComment.match(/\n/g) || []).length;
			const startLineContent = content.split('\n')[startLine];
			const commentStartInLine = beforeComment.length - beforeComment.lastIndexOf('\n') - 1;
			
			const prefixLength = this.settings.commentPrefix.length;
			const cursorPos = { 
				line: startLine, 
				ch: commentStartInLine + prefixLength + (startLineContent.substring(commentStartInLine + prefixLength).match(/^\s*/) || [''])[0].length
			};
			
			editor.setCursor(cursorPos);
			editor.scrollIntoView(
				{ from: cursorPos, to: cursorPos },
				true
			);
			editor.focus();
		});

		this.debug('Setting skipNextRefresh to true');
		this.skipNextRefresh = true;
		setTimeout(() => {
			this.debug('Clearing skipNextRefresh');
			this.skipNextRefresh = false;
		}, 200);
	}

	highlightHeaderInEditor(header: HeaderData) {
		this.debug('highlightHeaderInEditor called', header);
	
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice('No active markdown file');
			return;
		}

		this.app.workspace.getLeaf().openFile(file).then(() => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView) return;

			const editor = activeView.editor;
			const headers = this.extractHeaders(editor.getValue());
			const match = headers.find(h => h.text === header.text && h.level === header.level);

			if (!match) return;

			editor.setCursor({ line: match.line, ch: 0 });
			editor.scrollIntoView({ from: { line: match.line, ch: 0 }, to: { line: match.line, ch: 0 } }, true);
		});
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
	private currentFile: TFile | null = null;
	private renderedGroups: RenderedGroup[] = [];
	private isCollapsed: boolean = false;
	private hasManualExpansions: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: CommentsManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.isCollapsed = plugin.settings.defaultCollapsed;
	}

	private debug(message: string, ...args: any[]) {
		if (this.plugin.settings.debugMode) {
			console.log(`[Comments View] ${message}`, ...args);
		}
	}

	getViewType() {
		return COMMENTS_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Comments';
	}

	getIcon() {
		return 'percent';
	}

	async onOpen() {
		this.refresh();
	}

	async onClose() {
		// Nothing to clean up
	}

	refresh() {
		this.debug('CommentsView.refresh called');
		
		const container = this.containerEl.children[1];
		container.empty();

		// Add header with controls
		const header = container.createEl('div', { cls: 'comments-header' });
		
		// Title and controls container
		const titleRow = header.createEl('div', { cls: 'comments-title-row' });
		titleRow.createEl('h4', { text: 'Comments', cls: 'comments-title' });
		
		// Controls container
		const controlsContainer = titleRow.createEl('div', { cls: 'comments-controls' });
		
		// Print Mode button
		const printModeBtn = controlsContainer.createEl('button', { 
			cls: 'comments-control-btn print-mode-btn',
			attr: { title: 'Convert comments to callouts for printing' }
		});
		printModeBtn.innerHTML = '🖨️';
		
		// Toggle button for collapse/expand all
		const toggleAllBtn = controlsContainer.createEl('button', { 
			cls: 'comments-toggle-btn',
			attr: { title: 'Toggle collapse/expand all sections' }
		});
		
		const toggleIcon = toggleAllBtn.createEl('span', { cls: 'comments-toggle-icon' });
		toggleIcon.innerHTML = this.isCollapsed ? '+' : '-';
		
		// Add search container below the title row
		const searchContainer = header.createEl('div', { cls: 'comments-search-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			cls: 'comments-search-input',
			attr: { 
				placeholder: 'Search comments...',
				spellcheck: 'false'
			}
		});
		
		const clearSearchBtn = searchContainer.createEl('button', {
			cls: 'comments-clear-search',
			attr: { title: 'Clear search' }
		});
		clearSearchBtn.innerHTML = '×';

		// Get active file content with a small delay to ensure proper focus
		setTimeout(() => {
			this.debug('Executing delayed refresh check');
			
			let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			let currentFile = this.app.workspace.getActiveFile();
			
			this.debug('Active view:', !!activeView, 'Current file:', !!currentFile);
			
			if (!activeView && currentFile) {
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					if (view.file === currentFile) {
						activeView = view;
						this.debug('Found view for current file');
						break;
					}
				}
			}
			
			if (!activeView && this.currentFile) {
				this.debug('Using stored current file');
				currentFile = this.currentFile;
			}
			
			if (!activeView && !currentFile) {
				this.debug('No active markdown view or file found');
				container.createEl('div', { 
					text: 'No active markdown file', 
					cls: 'comments-empty' 
				});
				
				toggleAllBtn.disabled = true;
				printModeBtn.disabled = true;
				return;
			}

			if (currentFile) {
				this.currentFile = currentFile;
			}

			this.debug('Getting file content');
			let content = '';
			
			if (activeView) {
				content = activeView.editor.getValue();
				this.debug('Got content from active view');
				this.processComments(content, container, toggleAllBtn, toggleIcon, searchInput, clearSearchBtn, printModeBtn);
			} else if (currentFile) {
				this.app.vault.read(currentFile).then(fileContent => {
					this.debug('Got content from file read');
					this.processComments(fileContent, container, toggleAllBtn, toggleIcon, searchInput, clearSearchBtn, printModeBtn);
				});
			}
		}, 10);
	}

	private processComments(content: string, container: Element, toggleBtn?: HTMLButtonElement, toggleIcon?: HTMLElement, searchInput?: HTMLInputElement, clearSearchBtn?: HTMLButtonElement, printModeBtn?: HTMLButtonElement) {
		this.debug('Processing comments for content of length:', content.length);
		
		const currentStates = new Map<string, boolean>();
		this.renderedGroups.forEach(rendered => {
			if (rendered.group.header) {
				const key = `${rendered.group.header.level}-${rendered.group.header.text}`;
				currentStates.set(key, !rendered.group.isCollapsed);
			}
		});
		
		this.renderedGroups = [];
		
		const comments = this.plugin.extractComments(content);
		const headers = this.plugin.extractHeaders(content);
		const commentGroups = this.plugin.groupCommentsByHeaders(comments, headers);
		
		this.debug('Found', comments.length, 'comments in', commentGroups.length, 'groups');

		if (comments.length === 0) {
			container.createEl('div', { 
				text: 'No comments found', 
				cls: 'comments-empty' 
			});
			
			if (toggleBtn) toggleBtn.disabled = true;
			if (searchInput) searchInput.disabled = true;
			if (printModeBtn) printModeBtn.disabled = true;
			return;
		}

		// Enable controls when we have comments
		if (toggleBtn) toggleBtn.disabled = false;
		if (searchInput) searchInput.disabled = false;
		if (printModeBtn) printModeBtn.disabled = false;

		// Set up Print Mode button event handler
		if (printModeBtn) {
			printModeBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.plugin.activatePrintMode();
			};
		}

		const commentsList = container.createEl('div', { cls: 'comments-list' });

		const allGroups: CommentGroup[] = [];
		const collectAllGroups = (groups: CommentGroup[]) => {
			groups.forEach(group => {
				allGroups.push(group);
				if (group.children) {
					collectAllGroups(group.children);
				}
			});
		};
		collectAllGroups(commentGroups);

		if (toggleBtn && toggleIcon) {
			toggleBtn.onclick = (e) => {
				this.debug('Toggle button clicked, current state:', this.isCollapsed);
				e.preventDefault();
				e.stopPropagation();
				this.toggleAllGroups(toggleIcon);
			};
			
			this.updateToggleButton(toggleIcon);
		}

		if (searchInput && clearSearchBtn) {
			let searchTimeout: number | null = null;
			let currentSearchTerm = '';
			
			const performSearch = () => {
				const searchTerm = searchInput.value.toLowerCase().trim();
				currentSearchTerm = searchTerm;
				this.filterComments(commentsList, commentGroups, searchTerm);
				
				if (searchTerm) {
					clearSearchBtn.style.display = 'block';
				} else {
					clearSearchBtn.style.display = 'none';
				}
			};
			
			(this as any).currentSearchTerm = '';
			
			searchInput.addEventListener('input', () => {
				if (searchTimeout) {
					window.clearTimeout(searchTimeout);
				}
				searchTimeout = window.setTimeout(() => {
					(this as any).currentSearchTerm = searchInput.value.toLowerCase().trim();
					performSearch();
				}, 300);
			});
			
			clearSearchBtn.addEventListener('click', () => {
				searchInput.value = '';
				(this as any).currentSearchTerm = '';
				performSearch();
				searchInput.focus();
			});
			
			clearSearchBtn.style.display = 'none';
		}

		commentGroups.forEach(group => {
			if (this.isCollapsed && !this.hasManualExpansions) {
				this.setGroupCollapsedRecursively(group, true);
			}
			this.renderCommentGroup(group, commentsList, 0);
		});
		
		if (this.hasManualExpansions && currentStates.size > 0) {
			this.restoreExpansionStates(commentGroups, currentStates);
		}
		
		this.debug('Rendered groups count:', this.renderedGroups.length);
		this.debug('Initial collapsed state:', this.isCollapsed, 'hasManualExpansions:', this.hasManualExpansions);
	}

	private restoreExpansionStates(groups: CommentGroup[], states: Map<string, boolean>) {
		const restoreGroup = (group: CommentGroup) => {
			if (group.header) {
				const key = `${group.header.level}-${group.header.text}`;
				const wasExpanded = states.get(key);
				if (wasExpanded !== undefined) {
					group.isCollapsed = !wasExpanded;
					
					const rendered = this.renderedGroups.find(r => 
						r.group.header && 
						r.group.header.level === group.header!.level && 
						r.group.header.text === group.header!.text
					);
					if (rendered) {
						rendered.collapseIcon.textContent = group.isCollapsed ? '▶' : '▼';
						rendered.contentElement.style.display = group.isCollapsed ? 'none' : 'block';
					}
				}
			}
			
			if (group.children) {
				group.children.forEach(restoreGroup);
			}
		};
		
		groups.forEach(restoreGroup);
	}

	private setGroupCollapsedRecursively(group: CommentGroup, collapsed: boolean) {
		group.isCollapsed = collapsed;
		if (group.children) {
			group.children.forEach(child => {
				this.setGroupCollapsedRecursively(child, collapsed);
			});
		}
	}

	private highlightSearchText(text: string, searchTerm: string): string {
		if (!searchTerm) return text;
	
		const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
		return text.replace(regex, '<mark class="search-highlight">$1</mark>');
	}

	private filterComments(commentsList: Element, commentGroups: CommentGroup[], searchTerm: string) {
		commentsList.empty();
		
		if (!searchTerm) {
			commentGroups.forEach(group => {
				this.renderCommentGroup(group, commentsList, 0);
			});
			return;
		}
		
		const filteredGroups = this.filterGroupsRecursively(commentGroups, searchTerm);
		
		if (filteredGroups.length === 0) {
			commentsList.createEl('div', {
				text: 'No matching comments found',
				cls: 'comments-empty'
			});
			return;
		}
		
		filteredGroups.forEach(group => {
			this.renderCommentGroup(group, commentsList, 0);
		});
	}
	
	private filterGroupsRecursively(groups: CommentGroup[], searchTerm: string): CommentGroup[] {
		const filtered: CommentGroup[] = [];
		
		groups.forEach(group => {
			const headerMatches = group.header?.text.toLowerCase().includes(searchTerm) || false;
			
			const matchingComments = group.comments.filter(comment => 
				comment.text.toLowerCase().includes(searchTerm)
			);
			
			const filteredChildren = group.children ? 
				this.filterGroupsRecursively(group.children, searchTerm) : [];
			
			if (headerMatches || matchingComments.length > 0 || filteredChildren.length > 0) {
				const filteredGroup: CommentGroup = {
					header: group.header,
					comments: headerMatches ? group.comments : matchingComments,
					children: filteredChildren.length > 0 ? filteredChildren : undefined,
					parent: group.parent,
					isCollapsed: false
				};
				
				filtered.push(filteredGroup);
			}
		});
		
		return filtered;
	}

	private renderCommentGroup(group: CommentGroup, container: Element, depth: number) {
		const headerSection = container.createEl('div', { cls: 'comment-header-section' });
		headerSection.style.marginLeft = `${depth * 12}px`;
		
		const headerEl = headerSection.createEl('div', { cls: 'comment-header' });
		
		const collapseIcon = headerEl.createEl('span', { cls: 'comment-collapse-icon' });
		const hasChildren = (group.children && group.children.length > 0) || group.comments.length > 0;
		
		if (hasChildren) {
			collapseIcon.textContent = group.isCollapsed ? '▶' : '▼';
			collapseIcon.style.visibility = 'visible';
		} else {
			collapseIcon.style.visibility = 'hidden';
		}
		
		const headerText = headerEl.createEl('span', { cls: 'comment-header-text' });
		if (group.header) {
			const totalComments = this.countTotalComments(group);
			if (totalComments > 0) {
				headerText.textContent = `${group.header.text} (${totalComments})`;
			} else {
				headerText.textContent = group.header.text;
			}
		} else {
			headerText.textContent = `No Header (${group.comments.length})`;
		}
		
		const groupContent = headerSection.createEl('div', { cls: 'comment-group-content' });
		if (group.isCollapsed) {
			groupContent.style.display = 'none';
		}
		
		if (hasChildren) {
			this.renderedGroups.push({
				group: group,
				collapseIcon: collapseIcon,
				contentElement: groupContent
			});
		}
		
		if (hasChildren) {
			collapseIcon.addEventListener('click', (e) => {
				this.debug('Collapse icon clicked for group:', group.header?.text || 'No Header');
				e.preventDefault();
				e.stopPropagation();
				this.toggleGroupCollapse(group, collapseIcon, groupContent);
			});
		}
		
		if (group.header) {
			headerText.addEventListener('click', (e) => {
				this.debug('Header text clicked, navigating to:', group.header!.text);
				e.preventDefault();
				e.stopPropagation();
				
				this.plugin.skipNextRefresh = true;
				this.plugin.highlightHeaderInEditor(group.header!);
				
				setTimeout(() => {
					this.plugin.skipNextRefresh = false;
				}, 100);
				
				return false;
			});
			
			headerEl.addEventListener('click', (e) => {
				if (e.target === collapseIcon || e.target === headerText) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				return false;
			});
		}

		if (group.comments.length > 0) {
			const groupComments = groupContent.createEl('div', { cls: 'comment-group-comments' });
			group.comments.forEach(comment => {
				this.createCommentElement(comment, groupComments);
			});
		}

		if (group.children) {
			group.children.forEach(childGroup => {
				this.renderCommentGroup(childGroup, groupContent, depth + 1);
			});
		}
	}

	private countTotalComments(group: CommentGroup): number {
		let total = group.comments.length;
		if (group.children) {
			group.children.forEach((child: CommentGroup) => {
				total += this.countTotalComments(child);
			});
		}
		return total;
	}

	private toggleGroupCollapse(group: CommentGroup, icon: Element, content: HTMLElement) {
		group.isCollapsed = !group.isCollapsed;
		
		if (group.isCollapsed) {
			icon.textContent = '▶';
			content.style.display = 'none';
		} else {
			icon.textContent = '▼';
			content.style.display = 'block';
			this.hasManualExpansions = true;
		}

		if (group.isCollapsed && group.children) {
			this.collapseAllChildren(group);
		}
		
		this.debug('Group toggled, hasManualExpansions:', this.hasManualExpansions);
	}

	private toggleAllGroups(toggleIcon: HTMLElement) {
		this.debug('toggleAllGroups called, current state:', this.isCollapsed);
		
		if (this.isCollapsed) {
			this.debug('Expanding all groups');
			this.expandAllGroups([]);
			this.hasManualExpansions = false;
		} else {
			this.debug('Collapsing all groups to top level overview');
			this.collapseAllGroups([]);
			this.hasManualExpansions = false;
		}
		
		this.isCollapsed = !this.isCollapsed;
		this.updateToggleButton(toggleIcon);
		
		this.debug('toggleAllGroups completed, new state:', this.isCollapsed);
	}
	
	private updateToggleButton(toggleIcon: HTMLElement) {
		if (this.isCollapsed) {
			toggleIcon.innerHTML = '+';
			toggleIcon.parentElement!.setAttribute('title', 'Expand all sections');
		} else {
			toggleIcon.innerHTML = '-';
			toggleIcon.parentElement!.setAttribute('title', 'Collapse all sections');
		}
	}

	private collapseAllGroups(allGroups: CommentGroup[]) {
		this.debug('Collapsing all groups to top level overview');
		
		this.renderedGroups.forEach(rendered => {
			const hasContent = (rendered.group.children && rendered.group.children.length > 0) || rendered.group.comments.length > 0;
			
			if (hasContent) {
				rendered.group.isCollapsed = true;
				rendered.collapseIcon.textContent = '▶';
				rendered.contentElement.style.display = 'none';
			}
		});
	}

	private expandAllGroups(allGroups: CommentGroup[]) {
		this.debug('Expanding all groups');
		this.renderedGroups.forEach(rendered => {
			rendered.group.isCollapsed = false;
			rendered.collapseIcon.textContent = '▼';
			rendered.contentElement.style.display = 'block';
		});
	}

	private collapseAllChildren(group: CommentGroup) {
		if (group.children) {
			group.children.forEach((child: CommentGroup) => {
				child.isCollapsed = true;
				this.collapseAllChildren(child);
			});
		}
	}

	private createCommentElement(comment: CommentData, container: Element) {
		const commentEl = container.createEl('div', { cls: 'comment-item' });
		
		const contentEl = commentEl.createEl('div', { cls: 'comment-content' });
		
		const isMultiLine = comment.text.includes('\n');
		
		let textEl: HTMLElement;
		if (isMultiLine) {
			textEl = contentEl.createEl('textarea', { 
				cls: 'comment-text comment-textarea',
				attr: { 
					spellcheck: 'false',
					rows: (comment.text.split('\n').length + 1).toString()
				}
			}) as HTMLTextAreaElement;
			(textEl as HTMLTextAreaElement).value = comment.text || '';
		} else {
			textEl = contentEl.createEl('div', { 
				cls: 'comment-text',
				attr: { contenteditable: 'true', spellcheck: 'false' }
			});
			textEl.textContent = comment.text || '(empty comment)';
		}
		
		const currentSearchTerm = (this as any).currentSearchTerm || '';
		if (currentSearchTerm && comment.text.toLowerCase().includes(currentSearchTerm) && !isMultiLine) {
			if (textEl.tagName === 'DIV') {
				textEl.innerHTML = this.highlightSearchText(comment.text || '(empty comment)', currentSearchTerm);
			}
		}
		
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

		// Convert to Callout button
		const convertBtn = actionsEl.createEl('button', { 
			text: '📝', 
			cls: 'comment-btn comment-convert-btn',
			attr: { title: 'Convert to callout' }
		});

		// Delete button
		const deleteBtn = actionsEl.createEl('button', { 
			text: '×', 
			cls: 'comment-btn comment-delete-btn',
			attr: { title: 'Delete comment' }
		});
		convertBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			
			// Open the conversion modal
			new CommentConversionModal(this.app, comment, (customTitle: string) => {
			  this.convertCommentToCallout(comment, customTitle);
			}).open();
		});

		let originalText = comment.text;
		let isEditing = false;

		const handleInput = () => {
			if (!isEditing) {
				isEditing = true;
				saveBtn.style.display = 'inline-block';
				cancelBtn.style.display = 'inline-block';
				deleteBtn.style.display = 'none';
				commentEl.addClass('comment-editing');
			}
		};

		if (textEl.tagName === 'TEXTAREA') {
			(textEl as HTMLTextAreaElement).addEventListener('input', handleInput);
			
			const autoResize = () => {
				const textarea = textEl as HTMLTextAreaElement;
				textarea.style.height = 'auto';
				textarea.style.height = textarea.scrollHeight + 'px';
			};
			
			(textEl as HTMLTextAreaElement).addEventListener('input', autoResize);
			setTimeout(autoResize, 0);
		} else {
			textEl.addEventListener('input', handleInput);
		}

		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey && textEl.tagName !== 'TEXTAREA') {
				e.preventDefault();
				saveComment();
			} else if (e.key === 'Enter' && e.ctrlKey && textEl.tagName === 'TEXTAREA') {
				e.preventDefault();
				saveComment();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				cancelEdit();
			}
		};

		textEl.addEventListener('keydown', handleKeydown);

		const saveComment = () => {
			let newText: string;
			if (textEl.tagName === 'TEXTAREA') {
				newText = (textEl as HTMLTextAreaElement).value.trim();
			} else {
				newText = textEl.textContent?.trim() || '';
			}
			
			if (newText !== originalText) {
				this.updateCommentInEditor(comment, newText);
				originalText = newText;
			}
			exitEditMode();
		};

		const cancelEdit = () => {
			if (textEl.tagName === 'TEXTAREA') {
				(textEl as HTMLTextAreaElement).value = originalText;
			} else {
				if (currentSearchTerm && originalText.toLowerCase().includes(currentSearchTerm)) {
					textEl.innerHTML = this.highlightSearchText(originalText, currentSearchTerm);
				} else {
					textEl.textContent = originalText;
				}
			}
			exitEditMode();
		};

		const exitEditMode = () => {
			isEditing = false;
			saveBtn.style.display = 'none';
			cancelBtn.style.display = 'none';
			deleteBtn.style.display = 'inline-block';
			commentEl.removeClass('comment-editing');
			textEl.blur();
		};

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
			
			const confirmDelete = confirm(`Are you sure you want to delete this comment?\n\n"${comment.text.length > 100 ? comment.text.substring(0, 100) + '...' : comment.text}"`);
			if (confirmDelete) {
				this.deleteCommentFromEditor(comment);
			}
		});

		commentEl.addEventListener('click', (e) => {
			this.debug('Comment clicked, isEditing:', isEditing, 'target:', e.target);
			
			if (isEditing) return;
			
			const target = e.target as HTMLElement;
			if (target.tagName === 'BUTTON' || target.closest('button')) {
				this.debug('Click was on button, ignoring');
				return;
			}
			
			if (target === textEl) {
				this.debug('Clicked on text element, entering edit mode');
				e.preventDefault();
				e.stopPropagation();
				
				isEditing = true;
				saveBtn.style.display = 'inline-block';
				cancelBtn.style.display = 'inline-block';
				deleteBtn.style.display = 'none';
				commentEl.addClass('comment-editing');
				
				textEl.focus();
				
				if (textEl.tagName === 'TEXTAREA') {
					(textEl as HTMLTextAreaElement).select();
				} else {
					const range = document.createRange();
					range.selectNodeContents(textEl);
					const selection = window.getSelection();
					if (selection) {
						selection.removeAllRanges();
						selection.addRange(range);
					}
				}
				
				return;
			}
			
			this.debug('Calling highlightCommentInEditor');
			e.preventDefault();
			e.stopPropagation();
			
			this.plugin.skipNextRefresh = true;
			this.plugin.highlightCommentInEditor(comment);
			
			setTimeout(() => {
				this.plugin.skipNextRefresh = false;
			}, 300);
		});

		commentEl.addEventListener('mouseleave', () => {
			commentEl.removeClass('comment-item-hover');
		});
	}

	updateCommentInEditor(comment: CommentData, newText: string) {
		this.debug('updateCommentInEditor called with:', newText);
		
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		let currentFile = this.app.workspace.getActiveFile();
		
		this.debug('Active view:', !!activeView, 'Current file:', !!currentFile);
		
		if (!activeView && currentFile) {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				const view = leaf.view as MarkdownView;
				if (view.file === currentFile) {
					activeView = view;
					this.debug('Found view for current file in update');
					break;
				}
			}
		}
		
		if (!activeView && this.currentFile) {
			this.debug('Using stored current file for update');
			currentFile = this.currentFile;
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				const view = leaf.view as MarkdownView;
				if (view.file === currentFile) {
					activeView = view;
					this.debug('Found view for stored file in update');
					break;
				}
			}
		}
		
		if (!activeView) {
			this.debug('No active view found for updating comment');
			return;
		}

		this.debug('Found active view, proceeding with update');
		const editor = activeView.editor;
		const currentContent = editor.getValue();
		
		this.debug('Current content length:', currentContent.length);
		this.debug('Original comment:', comment);
		
		const currentComments = this.plugin.extractComments(currentContent);
		const matchingComment = currentComments.find(c => 
			c.text === comment.text && 
			c.line === comment.line
		);
		
		if (!matchingComment) {
			this.debug('Could not find matching comment in current content');
			const textMatch = currentComments.find(c => c.text === comment.text);
			if (textMatch) {
				this.debug('Found comment by text match');
				this.performCommentUpdate(editor, textMatch, newText);
			} else {
				this.debug('Comment not found, it may have been deleted');
				this.refresh();
			}
			return;
		}
		
		this.debug('Found matching comment with current positions:', matchingComment);
		this.performCommentUpdate(editor, matchingComment, newText);
	}

	private performCommentUpdate(editor: any, comment: CommentData, newText: string) {
		const content = editor.getValue();
		
		const beforeComment = content.substring(0, comment.startPos);
		const afterComment = content.substring(comment.endPos);
		
		const newComment = `${this.plugin.settings.commentPrefix} ${newText} ${this.plugin.settings.commentPrefix}`;
		
		this.debug('Replacing comment at positions', comment.startPos, '-', comment.endPos);
		this.debug('Old comment:', comment.fullMatch);
		this.debug('New comment:', newComment);
		
		const newContent = beforeComment + newComment + afterComment;
		editor.setValue(newContent);
		
		new Notice('Comment updated');
		
		setTimeout(() => {
			this.debug('Refreshing view after comment update');
			this.refresh();
		}, 100);
	}

	deleteCommentFromEditor(comment: CommentData) {
		this.debug('deleteCommentFromEditor called for:', comment);
		
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		let currentFile = this.app.workspace.getActiveFile();
		
		this.debug('Delete - Active view:', !!activeView, 'Current file:', !!currentFile);
		
		if (!activeView && currentFile) {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				const view = leaf.view as MarkdownView;
				if (view.file === currentFile) {
					activeView = view;
					this.debug('Found view for current file in delete');
					break;
				}
			}
		}
		
		if (!activeView && this.currentFile) {
			this.debug('Using stored current file for delete');
			currentFile = this.currentFile;
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				const view = leaf.view as MarkdownView;
				if (view.file === currentFile) {
					activeView = view;
					this.debug('Found view for stored file in delete');
					break;
				}
			}
		}
		
		if (!activeView) {
			this.debug('No active view found for deleting comment');
			return;
		}

		const editor = activeView.editor;
		const currentContent = editor.getValue();
		
		const currentComments = this.plugin.extractComments(currentContent);
		const matchingComment = currentComments.find(c => 
			c.text === comment.text && 
			c.line === comment.line
		);
		
		if (!matchingComment) {
			this.debug('Could not find matching comment to delete');
			this.refresh();
			return;
		}
		
		this.debug('Deleting comment at positions', matchingComment.startPos, '-', matchingComment.endPos);
		
		const beforeComment = currentContent.substring(0, matchingComment.startPos);
		const afterComment = currentContent.substring(matchingComment.endPos);
		
		const newContent = beforeComment + afterComment;
		const finalContent = newContent.replace(/  +/g, ' ');
		
		editor.setValue(finalContent);
		
		new Notice('Comment deleted');
		
		setTimeout(() => {
			this.debug('Refreshing view after comment deletion');
			this.refresh();
		}, 100);
	}
	convertCommentToCallout(comment: CommentData, customTitle?: string) {
			this.debug('convertCommentToCallout called for:', comment, 'with title:', customTitle);
		
			// Use the same robust view detection as other methods
			let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			let currentFile = this.app.workspace.getActiveFile();
		
			this.debug('Convert - Active view:', !!activeView, 'Current file:', !!currentFile);
		
			if (!activeView && currentFile) {
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					if (view.file === currentFile) {
						activeView = view;
						this.debug('Found view for current file in convert');
						break;
					}
				}
			}
		
			if (!activeView && this.currentFile) {
				this.debug('Using stored current file for convert');
				currentFile = this.currentFile;
				const leaves = this.app.workspace.getLeavesOfType('markdown');
				for (const leaf of leaves) {
					const view = leaf.view as MarkdownView;
					if (view.file === currentFile) {
						activeView = view;
						this.debug('Found view for stored file in convert');
						break;
					}
				}
			}
		
			if (!activeView) {
				this.debug('No active view found for converting comment');
				return;
			}

			const editor = activeView.editor;
			const currentContent = editor.getValue();
		
			// Find the comment again in the current content to get fresh positions
			const currentComments = this.plugin.extractComments(currentContent);
			const matchingComment = currentComments.find(c => 
				c.text === comment.text && 
				c.line === comment.line
			);
		
			if (!matchingComment) {
				this.debug('Could not find matching comment to convert');
				this.refresh();
				return;
			}
		
			// Extract headers for context
			const headers = this.plugin.extractHeaders(currentContent);
		
			// Create the callout using the same logic as print mode but with custom title
			const callout = this.createCalloutFromComment(matchingComment, headers, customTitle);
		
			this.debug('Converting comment at positions', matchingComment.startPos, '-', matchingComment.endPos);
			this.debug('Original comment:', matchingComment.fullMatch);
			this.debug('New callout:', callout);
		
			// Get the content before and after the comment
			const beforeComment = currentContent.substring(0, matchingComment.startPos);
			const afterComment = currentContent.substring(matchingComment.endPos);
		
			// Replace comment with callout
			const newContent = beforeComment + callout + afterComment;
		
			editor.setValue(newContent);
			editor.refresh();
		
			// Show success message
			const titleText = customTitle ? `"${customTitle}"` : 'callout';
			new Notice(`Comment converted to ${titleText}`);
		
			// Refresh the view
			setTimeout(() => {
				this.debug('Refreshing view after comment conversion');
				this.refresh();
			}, 100);
		}

		private createCalloutFromComment(comment: CommentData, headers: HeaderData[], customTitle?: string): string {
			const calloutType = this.plugin.settings.printModeCalloutType;
		
			// Use custom title if provided, otherwise generate default
			let title: string;
			if (customTitle && customTitle.trim().length > 0) {
				title = customTitle.trim();
			} else {
				// Find the nearest header for context (original logic)
				let nearestHeader: HeaderData | null = null;
				for (let i = headers.length - 1; i >= 0; i--) {
					if (headers[i].line < comment.line) {
						nearestHeader = headers[i];
						break;
					}
				}

				title = 'Comment';
				if (nearestHeader) {
					title = `Comment: ${nearestHeader.text}`;
				}
			
				// Add line number for reference
				title += ` (Line ${comment.line + 1})`;
			}

			// Format comment text for callout
			const commentText = comment.text
				.split('\n')
				.map(line => line.trim())
				.filter(line => line.length > 0)
				.join('\n> ');

			// Create the callout
			let callout = `\n> [!${calloutType}]+ ${title}\n> ${commentText}\n`;

			return callout;
		}
}

// Settings tab class with Print Mode settings
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

		new Setting(containerEl)
			.setName('Default collapsed view')
			.setDesc('Start with comments panel in collapsed state (showing only headers)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultCollapsed)
				.onChange(async (value) => {
					this.plugin.settings.defaultCollapsed = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCommentsView();
				}));

		new Setting(containerEl)
			.setName('Debug mode')
			.setDesc('Enable debug logging in the developer console (for troubleshooting)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));

		// Print Mode Settings Section
		containerEl.createEl('h3', { text: 'Print Mode Settings' });

		new Setting(containerEl)
			.setName('Callout type for print mode')
			.setDesc('The type of callout to use when converting comments (e.g., comment, note, info)')
			.addText(text => text
				.setPlaceholder('comment')
				.setValue(this.plugin.settings.printModeCalloutType)
				.onChange(async (value) => {
					this.plugin.settings.printModeCalloutType = value || 'comment';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include comment author')
			.setDesc('Include author information in converted callouts (placeholder for future feature)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeCommentAuthor)
				.onChange(async (value) => {
					this.plugin.settings.includeCommentAuthor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include comment timestamp')
			.setDesc('Include timestamp information in converted callouts (placeholder for future feature)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeCommentTimestamp)
				.onChange(async (value) => {
					this.plugin.settings.includeCommentTimestamp = value;
					await this.plugin.saveSettings();
				}));

		// Print Mode Usage Instructions
		const instructionsEl = containerEl.createEl('div', { cls: 'print-mode-instructions' });
		instructionsEl.createEl('h4', { text: 'How to use Print Mode:' });
		const instructionsList = instructionsEl.createEl('ol');
		instructionsList.createEl('li', { text: 'Click the 🖨️ button in the Comments panel or use the command "Activate Print Mode"' });
		instructionsList.createEl('li', { text: 'Preview how your document will look with comments converted to callouts' });
		instructionsList.createEl('li', { text: 'Click "Export to PDF" to trigger PDF export with converted comments' });
		instructionsList.createEl('li', { text: 'Your original document remains unchanged - comments are converted temporarily' });
	}
}