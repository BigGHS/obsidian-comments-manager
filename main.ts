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
	debugMode: boolean;
	defaultCollapsed: boolean;
}

const DEFAULT_SETTINGS: CommentsManagerSettings = {
	commentPrefix: '%%',
	openOnStart: true,
	debugMode: false,
	defaultCollapsed: true
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

export default class CommentsManagerPlugin extends Plugin {
	settings: CommentsManagerSettings;
	private refreshTimeout: number | null = null;
	public skipNextRefresh: boolean = false; // Made public so CommentsView can access it
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
		this.debug('debounceRefresh called, skipNextRefresh:', this.skipNextRefresh);
		
		if (this.skipNextRefresh) {
			this.debug('Skipping refresh due to skipNextRefresh flag');
			this.skipNextRefresh = false; // Reset the flag
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
		const comments: CommentData[] = [];
		const prefix = this.escapeRegex(this.settings.commentPrefix);
		
		// Create regex to match multi-line comments
		const commentRegex = new RegExp(`${prefix}(.*?)${prefix}`, 'gs'); // 'g' for global, 's' for dotall (makes . match newlines)
		
		let match;
		while ((match = commentRegex.exec(content)) !== null) {
			const startPos = match.index;
			const endPos = match.index + match[0].length;
			const commentText = match[1].trim();
			
			// Find which line the comment starts on
			const beforeComment = content.substring(0, startPos);
			const startLine = (beforeComment.match(/\n/g) || []).length;
			
			// Preserve line breaks in the comment text for display
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
		// Store all headers for building complete hierarchy
		this.allHeaders = headers;
		
		const groups: CommentGroup[] = [];
		
		// Sort headers by line number
		const sortedHeaders = [...headers].sort((a, b) => a.line - b.line);
		
		// Group comments under their nearest preceding header
		comments.forEach(comment => {
			// Find the nearest preceding header
			let nearestHeader: HeaderData | null = null;
			
			for (let i = sortedHeaders.length - 1; i >= 0; i--) {
				if (sortedHeaders[i].line < comment.line) {
					nearestHeader = sortedHeaders[i];
					break;
				}
			}
			
			// Find or create the group for this header
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
		
		// Sort groups by header line number (null headers first)
		groups.sort((a, b) => {
			if (a.header === null && b.header === null) return 0;
			if (a.header === null) return -1;
			if (b.header === null) return 1;
			return a.header.line - b.header.line;
		});
		
		// Build hierarchical structure including all headers (even those without comments)
		return this.buildHierarchicalGroups(groups);
	}

	private buildHierarchicalGroups(flatGroups: CommentGroup[]): CommentGroup[] {
		// Create a map of header line numbers to groups that have comments
		const commentGroupsByHeaderLine = new Map<number, CommentGroup>();
		let noHeaderGroup: CommentGroup | null = null;
		
		flatGroups.forEach((group: CommentGroup) => {
			if (group.header) {
				commentGroupsByHeaderLine.set(group.header.line, group);
			} else {
				noHeaderGroup = group;
			}
		});
		
		// Create groups for ALL headers (like the outline does)
		const allGroups: CommentGroup[] = [];
		
		// Add "No Header" group first if it exists
		if (noHeaderGroup) {
			allGroups.push(noHeaderGroup);
		}
		
		// Process all headers in order - include ALL headers, not just those with comments
		const sortedHeaders = this.allHeaders.sort((a: HeaderData, b: HeaderData) => a.line - b.line);
		
		sortedHeaders.forEach((header: HeaderData) => {
			const existingGroup = commentGroupsByHeaderLine.get(header.line);
			if (existingGroup) {
				// Use existing group that has comments
				allGroups.push(existingGroup);
			} else {
				// Create new group for header without comments - include ALL headers
				allGroups.push({
					header: header,
					comments: []
				});
			}
		});
		
		// Build hierarchical structure
		const result: CommentGroup[] = [];
		const stack: CommentGroup[] = [];
		
		for (const group of allGroups) {
			if (!group.header) {
				// "No Header" group always goes first
				result.push(group);
				continue;
			}
			
			// Pop from stack until we find a proper parent (lower level number = higher level)
			while (stack.length > 0 && stack[stack.length - 1].header!.level >= group.header.level) {
				stack.pop();
			}
			
			if (stack.length > 0) {
				// This group has a parent - add it as a child
				const parent = stack[stack.length - 1];
				if (!parent.children) {
					parent.children = [];
				}
				parent.children.push(group);
				group.parent = parent;
			} else {
				// This is a top-level group
				result.push(group);
			}
			
			stack.push(group);
		}
		
		return result;
	}
	
	private hasDescendantComments(header: HeaderData, commentGroupsByHeaderLine: Map<number, CommentGroup>): boolean {
		// Check if any header that comes after this one and has a higher level (is a descendant) has comments
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
			
			// Try to find the exact comment first
			let match = comments.find(c => 
				c.text === comment.text && 
				c.line === comment.line && 
				c.startPos === comment.startPos
			);
			
			// If not found, try to find by text and line with some tolerance
			if (!match) {
				match = comments.find(c => 
					c.text === comment.text && 
					Math.abs(c.line - comment.line) <= 2
				);
			}
			
			// If still not found, use the original comment data
			const target = match || comment;
			
			this.debug('Found target comment:', target);

			// For multi-line comments, position cursor at the start of the comment
			const beforeComment = content.substring(0, target.startPos);
			const startLine = (beforeComment.match(/\n/g) || []).length;
			const startLineContent = content.split('\n')[startLine];
			const commentStartInLine = beforeComment.length - beforeComment.lastIndexOf('\n') - 1;
			
			// Position cursor at the start of the comment (after the opening prefix)
			const prefixLength = this.settings.commentPrefix.length;
			const cursorPos = { 
				line: startLine, 
				ch: commentStartInLine + prefixLength + (startLineContent.substring(commentStartInLine + prefixLength).match(/^\s*/) || [''])[0].length
			};
			
			// Set cursor position at the start of comment content
			editor.setCursor(cursorPos);
			
			// Scroll the comment into view
			editor.scrollIntoView(
				{ from: cursorPos, to: cursorPos },
				true
			);
			
			// Focus the editor
			editor.focus();
		});

		// Prevent the view from refreshing immediately after highlighting
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
	private isCollapsed: boolean = false; // Will be set from settings
	private hasManualExpansions: boolean = false; // Track if user manually expanded sections

	constructor(leaf: WorkspaceLeaf, plugin: CommentsManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
		// Set initial state from plugin settings
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
		
		// Single toggle button for collapse/expand all (centered)
		const toggleAllBtn = titleRow.createEl('button', { 
			cls: 'comments-toggle-btn',
			attr: { title: 'Toggle collapse/expand all sections' }
		});
		
		// Add the icon - set based on current collapsed state
		const toggleIcon = toggleAllBtn.createEl('span', { cls: 'comments-toggle-icon' });
		// Icon should show what will happen when clicked
		toggleIcon.innerHTML = this.isCollapsed ? '+' : '-';
		
		// Add empty spacer to balance the layout
		const spacer = titleRow.createEl('div', { cls: 'comments-spacer' });
		
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
		
		// Add clear search button
		const clearSearchBtn = searchContainer.createEl('button', {
			cls: 'comments-clear-search',
			attr: { title: 'Clear search' }
		});
		clearSearchBtn.innerHTML = '×';

		// Get active file content with a small delay to ensure proper focus
		setTimeout(() => {
			this.debug('Executing delayed refresh check');
			
			// Try to get the active view, but also check for the current file
			let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			let currentFile = this.app.workspace.getActiveFile();
			
			this.debug('Active view:', !!activeView, 'Current file:', !!currentFile);
			
			// If no active view but we have a current file, try to find the view for that file
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
			
			// If we still don't have a view, but we have the current file stored, use that
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
				
				// Disable button when no content
				toggleAllBtn.disabled = true;
				return;
			}

			// Store the current file for future reference
			if (currentFile) {
				this.currentFile = currentFile;
			}

			this.debug('Getting file content');
			let content = '';
			
			if (activeView) {
				content = activeView.editor.getValue();
				this.debug('Got content from active view');
				this.processComments(content, container, toggleAllBtn, toggleIcon, searchInput, clearSearchBtn);
			} else if (currentFile) {
				// If no active view, read from file (this shouldn't happen often, but is a fallback)
				this.app.vault.read(currentFile).then(fileContent => {
					this.debug('Got content from file read');
					this.processComments(fileContent, container, toggleAllBtn, toggleIcon, searchInput, clearSearchBtn);
				});
			}
		}, 10); // Small delay to ensure proper view state
	}

	private processComments(content: string, container: Element, toggleBtn?: HTMLButtonElement, toggleIcon?: HTMLElement, searchInput?: HTMLInputElement, clearSearchBtn?: HTMLButtonElement) {
		this.debug('Processing comments for content of length:', content.length);
		
		// Store current expansion states before refresh
		const currentStates = new Map<string, boolean>();
		this.renderedGroups.forEach(rendered => {
			if (rendered.group.header) {
				const key = `${rendered.group.header.level}-${rendered.group.header.text}`;
				currentStates.set(key, !rendered.group.isCollapsed);
			}
		});
		
		// Clear previous rendered groups
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
			
			// Disable button when no comments
			if (toggleBtn) toggleBtn.disabled = true;
			if (searchInput) searchInput.disabled = true;
			return;
		}

		// Enable controls when we have comments
		if (toggleBtn) toggleBtn.disabled = false;
		if (searchInput) searchInput.disabled = false;

		// Create comments list
		const commentsList = container.createEl('div', { cls: 'comments-list' });

		// Store reference to all groups for collapse/expand functionality
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

		// Set up toggle button event handler
		if (toggleBtn && toggleIcon) {
			toggleBtn.onclick = (e) => {
				this.debug('Toggle button clicked, current state:', this.isCollapsed);
				e.preventDefault();
				e.stopPropagation();
				this.toggleAllGroups(toggleIcon);
			};
			
			// Update button state based on current collapse state
			this.updateToggleButton(toggleIcon);
		}

		// Set up search functionality
		if (searchInput && clearSearchBtn) {
			let searchTimeout: number | null = null;
			let currentSearchTerm = '';
			
			const performSearch = () => {
				const searchTerm = searchInput.value.toLowerCase().trim();
				currentSearchTerm = searchTerm;
				this.filterComments(commentsList, commentGroups, searchTerm);
				
				// Show/hide clear button
				if (searchTerm) {
					clearSearchBtn.style.display = 'block';
				} else {
					clearSearchBtn.style.display = 'none';
				}
			};
			
			// Store search term for highlighting
			(this as any).currentSearchTerm = '';
			
			// Debounced search
			searchInput.addEventListener('input', () => {
				if (searchTimeout) {
					window.clearTimeout(searchTimeout);
				}
				searchTimeout = window.setTimeout(() => {
					(this as any).currentSearchTerm = searchInput.value.toLowerCase().trim();
					performSearch();
				}, 300);
			});
			
			// Clear search
			clearSearchBtn.addEventListener('click', () => {
				searchInput.value = '';
				(this as any).currentSearchTerm = '';
				performSearch();
				searchInput.focus();
			});
			
			// Hide clear button initially
			clearSearchBtn.style.display = 'none';
		}

		// Render the hierarchical groups
		commentGroups.forEach(group => {
			// Only apply global collapsed state if there are no manual expansions
			if (this.isCollapsed && !this.hasManualExpansions) {
				this.setGroupCollapsedRecursively(group, true);
			}
			this.renderCommentGroup(group, commentsList, 0);
		});
		
		// Restore previous expansion states if we have manual expansions
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
					
					// Update the visual state in the rendered groups
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
		// Clear current display
		commentsList.empty();
		
		if (!searchTerm) {
			// No search term - show all groups normally
			commentGroups.forEach(group => {
				this.renderCommentGroup(group, commentsList, 0);
			});
			return;
		}
		
		// Filter groups and comments based on search term
		const filteredGroups = this.filterGroupsRecursively(commentGroups, searchTerm);
		
		if (filteredGroups.length === 0) {
			commentsList.createEl('div', {
				text: 'No matching comments found',
				cls: 'comments-empty'
			});
			return;
		}
		
		// Render filtered groups
		filteredGroups.forEach(group => {
			this.renderCommentGroup(group, commentsList, 0);
		});
	}
	
	private filterGroupsRecursively(groups: CommentGroup[], searchTerm: string): CommentGroup[] {
		const filtered: CommentGroup[] = [];
		
		groups.forEach(group => {
			// Check if header matches search term
			const headerMatches = group.header?.text.toLowerCase().includes(searchTerm) || false;
			
			// Filter comments in this group
			const matchingComments = group.comments.filter(comment => 
				comment.text.toLowerCase().includes(searchTerm)
			);
			
			// Recursively filter children
			const filteredChildren = group.children ? 
				this.filterGroupsRecursively(group.children, searchTerm) : [];
			
			// Include group if header matches, has matching comments, or has matching children
			if (headerMatches || matchingComments.length > 0 || filteredChildren.length > 0) {
				const filteredGroup: CommentGroup = {
					header: group.header,
					comments: headerMatches ? group.comments : matchingComments,
					children: filteredChildren.length > 0 ? filteredChildren : undefined,
					parent: group.parent,
					isCollapsed: false // Expand all when searching to show results
				};
				
				filtered.push(filteredGroup);
			}
		});
		
		return filtered;
	}

	private renderCommentGroup(group: CommentGroup, container: Element, depth: number) {
		// Create header section
		const headerSection = container.createEl('div', { cls: 'comment-header-section' });
		headerSection.style.marginLeft = `${depth * 12}px`;
		
		// Create header element
		const headerEl = headerSection.createEl('div', { cls: 'comment-header' });
		
		// Add collapse/expand icon
		const collapseIcon = headerEl.createEl('span', { cls: 'comment-collapse-icon' });
		const hasChildren = (group.children && group.children.length > 0) || group.comments.length > 0;
		
		if (hasChildren) {
			collapseIcon.textContent = group.isCollapsed ? '▶' : '▼';
			collapseIcon.style.visibility = 'visible';
		} else {
			collapseIcon.style.visibility = 'hidden';
		}
		
		// Add header text (without # symbols)
		const headerText = headerEl.createEl('span', { cls: 'comment-header-text' });
		if (group.header) {
			// Count total comments in this group and all children
			const totalComments = this.countTotalComments(group);
			if (totalComments > 0) {
				headerText.textContent = `${group.header.text} (${totalComments})`;
			} else {
				// Show header without comment count if no comments
				headerText.textContent = group.header.text;
			}
		} else {
			headerText.textContent = `No Header (${group.comments.length})`;
		}
		
		// Create content container for this group (comments + children)
		const groupContent = headerSection.createEl('div', { cls: 'comment-group-content' });
		if (group.isCollapsed) {
			groupContent.style.display = 'none';
		}
		
		// Store reference to this rendered group if it has collapsible content
		if (hasChildren) {
			this.renderedGroups.push({
				group: group,
				collapseIcon: collapseIcon,
				contentElement: groupContent
			});
		}
		
		// Add click handler for collapse/expand icon
		if (hasChildren) {
			collapseIcon.addEventListener('click', (e) => {
				this.debug('Collapse icon clicked for group:', group.header?.text || 'No Header');
				e.preventDefault();
				e.stopPropagation();
				this.toggleGroupCollapse(group, collapseIcon, groupContent);
			});
		}
		
		// Add click handler for header text only (jump to header in editor)
		if (group.header) {
			headerText.addEventListener('click', (e) => {
				this.debug('Header text clicked, navigating to:', group.header!.text);
				e.preventDefault();
				e.stopPropagation();
				
				// Set flag to prevent refresh from changing collapse state
				this.plugin.skipNextRefresh = true;
				
				// Navigate to header without affecting collapse state
				this.plugin.highlightHeaderInEditor(group.header!);
				
				// Clear the flag after a delay
				setTimeout(() => {
					this.plugin.skipNextRefresh = false;
				}, 100);
				
				// Prevent any collapse/expand side effects
				return false;
			});
			
			// Prevent clicks on the header element itself from doing anything
			headerEl.addEventListener('click', (e) => {
				// Only allow clicks on the collapse icon or header text to proceed
				if (e.target === collapseIcon || e.target === headerText) {
					return; // Let the specific handlers deal with it
				}
				// Stop any other clicks on the header element
				e.preventDefault();
				e.stopPropagation();
				return false;
			});
		}

		// Add comments for this group
		if (group.comments.length > 0) {
			const groupComments = groupContent.createEl('div', { cls: 'comment-group-comments' });
			group.comments.forEach(comment => {
				this.createCommentElement(comment, groupComments);
			});
		}

		// Recursively render children
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
			// User manually expanded a section
			this.hasManualExpansions = true;
		}

		// When collapsing a parent, also collapse all children
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
			this.hasManualExpansions = false; // Reset manual expansion tracking
		} else {
			this.debug('Collapsing all groups to top level overview');
			this.collapseAllGroups([]);
			this.hasManualExpansions = false; // Reset manual expansion tracking
		}
		
		// Toggle state and update icon
		this.isCollapsed = !this.isCollapsed;
		this.updateToggleButton(toggleIcon);
		
		this.debug('toggleAllGroups completed, new state:', this.isCollapsed);
	}
	
	private updateToggleButton(toggleIcon: HTMLElement) {
		if (this.isCollapsed) {
			// When collapsed, show expand icon
			toggleIcon.innerHTML = '+'; // Simple plus
			toggleIcon.parentElement!.setAttribute('title', 'Expand all sections');
		} else {
			// When expanded, show collapse icon
			toggleIcon.innerHTML = '-'; // Simple minus
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
		
		// Comment content
		const contentEl = commentEl.createEl('div', { cls: 'comment-content' });
		
		// Editable comment text - use textarea for multi-line support
		const isMultiLine = comment.text.includes('\n');
		
		let textEl: HTMLElement;
		if (isMultiLine) {
			// Use textarea for multi-line comments
			textEl = contentEl.createEl('textarea', { 
				cls: 'comment-text comment-textarea',
				attr: { 
					spellcheck: 'false',
					rows: (comment.text.split('\n').length + 1).toString()
				}
			}) as HTMLTextAreaElement;
			(textEl as HTMLTextAreaElement).value = comment.text || '';
		} else {
			// Use div for single-line comments
			textEl = contentEl.createEl('div', { 
				cls: 'comment-text',
				attr: { contenteditable: 'true', spellcheck: 'false' }
			});
			textEl.textContent = comment.text || '(empty comment)';
		}
		
		// Apply search highlighting if there's a current search term
		const currentSearchTerm = (this as any).currentSearchTerm || '';
		if (currentSearchTerm && comment.text.toLowerCase().includes(currentSearchTerm) && !isMultiLine) {
			// Only apply highlighting to single-line comments in contenteditable divs
			if (textEl.tagName === 'DIV') {
				textEl.innerHTML = this.highlightSearchText(comment.text || '(empty comment)', currentSearchTerm);
			}
		}
		
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

		// Handle text editing - works for both div and textarea
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
			
			// Auto-resize textarea as content changes
			const autoResize = () => {
				const textarea = textEl as HTMLTextAreaElement;
				textarea.style.height = 'auto';
				textarea.style.height = textarea.scrollHeight + 'px';
			};
			
			(textEl as HTMLTextAreaElement).addEventListener('input', autoResize);
			// Initial resize
			setTimeout(autoResize, 0);
		} else {
			textEl.addEventListener('input', handleInput);
		}

		// Handle keyboard shortcuts in edit mode
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey && textEl.tagName !== 'TEXTAREA') {
				// For contenteditable divs, Enter saves (unless Shift+Enter)
				e.preventDefault();
				saveComment();
			} else if (e.key === 'Enter' && e.ctrlKey && textEl.tagName === 'TEXTAREA') {
				// For textareas, Ctrl+Enter saves
				e.preventDefault();
				saveComment();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				cancelEdit();
			}
		};

		textEl.addEventListener('keydown', handleKeydown);

		// Save comment function
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

		// Cancel edit function
		const cancelEdit = () => {
			if (textEl.tagName === 'TEXTAREA') {
				(textEl as HTMLTextAreaElement).value = originalText;
			} else {
				// Restore original text with highlighting if applicable
				if (currentSearchTerm && originalText.toLowerCase().includes(currentSearchTerm)) {
					textEl.innerHTML = this.highlightSearchText(originalText, currentSearchTerm);
				} else {
					textEl.textContent = originalText;
				}
			}
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
			
			// Add confirmation dialog
			const confirmDelete = confirm(`Are you sure you want to delete this comment?\n\n"${comment.text.length > 100 ? comment.text.substring(0, 100) + '...' : comment.text}"`);
			if (confirmDelete) {
				this.deleteCommentFromEditor(comment);
			}
		});

		// Make the comment clickable (only when not editing)
		commentEl.addEventListener('click', (e) => {
			this.debug('Comment clicked, isEditing:', isEditing, 'target:', e.target);
			
			// Don't navigate if we're editing
			if (isEditing) return;
			
			// Check if the click was on a button
			const target = e.target as HTMLElement;
			if (target.tagName === 'BUTTON' || target.closest('button')) {
				this.debug('Click was on button, ignoring');
				return;
			}
			
			// If clicking on the text element specifically, make it editable instead of navigating
			if (target === textEl) {
				this.debug('Clicked on text element, entering edit mode');
				e.preventDefault();
				e.stopPropagation();
				
				// Enter edit mode
				isEditing = true;
				saveBtn.style.display = 'inline-block';
				cancelBtn.style.display = 'inline-block';
				deleteBtn.style.display = 'none';
				commentEl.addClass('comment-editing');
				
				// Focus the text element for editing
				textEl.focus();
				
				// Select all text for easy editing
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
			
			// For clicks anywhere else in the comment, navigate to the comment in the document
			this.debug('Calling highlightCommentInEditor');
			e.preventDefault();
			e.stopPropagation();
			
			// Set flag to prevent refresh from changing collapse state
			this.plugin.skipNextRefresh = true;
			
			this.plugin.highlightCommentInEditor(comment);
			
			// Clear the flag after a delay
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
		
		// Use the same robust view detection as in refresh()
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		let currentFile = this.app.workspace.getActiveFile();
		
		this.debug('Active view:', !!activeView, 'Current file:', !!currentFile);
		
		// If no active view but we have a current file, try to find the view for that file
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
		
		// If we still don't have a view, but we have the current file stored, use that
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
		
		// Find the comment again in the current content to get fresh positions
		const currentComments = this.plugin.extractComments(currentContent);
		const matchingComment = currentComments.find(c => 
			c.text === comment.text && 
			c.line === comment.line
		);
		
		if (!matchingComment) {
			this.debug('Could not find matching comment in current content');
			// Fallback: try to find by text only
			const textMatch = currentComments.find(c => c.text === comment.text);
			if (textMatch) {
				this.debug('Found comment by text match');
				this.performCommentUpdate(editor, textMatch, newText);
			} else {
				this.debug('Comment not found, it may have been deleted');
				// Refresh the view to show current state
				this.refresh();
			}
			return;
		}
		
		this.debug('Found matching comment with current positions:', matchingComment);
		this.performCommentUpdate(editor, matchingComment, newText);
	}

	private performCommentUpdate(editor: any, comment: CommentData, newText: string) {
		const content = editor.getValue();
		
		// Use the fresh comment positions
		const beforeComment = content.substring(0, comment.startPos);
		const afterComment = content.substring(comment.endPos);
		
		// Create the new comment with the updated text
		const newComment = `${this.plugin.settings.commentPrefix} ${newText} ${this.plugin.settings.commentPrefix}`;
		
		this.debug('Replacing comment at positions', comment.startPos, '-', comment.endPos);
		this.debug('Old comment:', comment.fullMatch);
		this.debug('New comment:', newComment);
		
		// Replace the content
		const newContent = beforeComment + newComment + afterComment;
		editor.setValue(newContent);
		
		// Show success message
		new Notice('Comment updated');
		
		// Refresh the view after a short delay to get updated positions
		setTimeout(() => {
			this.debug('Refreshing view after comment update');
			this.refresh();
		}, 100);
	}

	deleteCommentFromEditor(comment: CommentData) {
		this.debug('deleteCommentFromEditor called for:', comment);
		
		// Use the same robust view detection as in refresh()
		let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		let currentFile = this.app.workspace.getActiveFile();
		
		this.debug('Delete - Active view:', !!activeView, 'Current file:', !!currentFile);
		
		// If no active view but we have a current file, try to find the view for that file
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
		
		// If we still don't have a view, but we have the current file stored, use that
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
		
		// Find the comment again in the current content to get fresh positions
		const currentComments = this.plugin.extractComments(currentContent);
		const matchingComment = currentComments.find(c => 
			c.text === comment.text && 
			c.line === comment.line
		);
		
		if (!matchingComment) {
			this.debug('Could not find matching comment to delete');
			this.refresh(); // Refresh to show current state
			return;
		}
		
		this.debug('Deleting comment at positions', matchingComment.startPos, '-', matchingComment.endPos);
		
		// Get the content before and after the comment
		const beforeComment = currentContent.substring(0, matchingComment.startPos);
		const afterComment = currentContent.substring(matchingComment.endPos);
		
		// Simply remove the comment by joining before and after
		const newContent = beforeComment + afterComment;
		
		// Clean up any double spaces that might be left behind
		const finalContent = newContent.replace(/  +/g, ' ');
		
		editor.setValue(finalContent);
		
		// Show success message
		new Notice('Comment deleted');
		
		// Refresh the view
		setTimeout(() => {
			this.debug('Refreshing view after comment deletion');
			this.refresh();
		}, 100);
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
	}
}