/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */


// @INCLUDE_IN_API_DOCS

/*unittests: FileTreeView*/

/**
 * This is the view layer (template) for the file tree in the sidebar. It takes a FileTreeViewModel
 * and renders it to the given element using Preact. User actions are signaled via an ActionCreator
 * (in the Flux sense).
 */
define(function (require, exports, module) {


    var Preact            = require("thirdparty/preact"),
        Classnames        = require("thirdparty/classnames"),
        Immutable         = require("thirdparty/immutable"),
        _                 = require("thirdparty/lodash"),
        FileUtils         = require("file/FileUtils"),
        LanguageManager   = require("language/LanguageManager"),
        FileTreeViewModel = require("project/FileTreeViewModel"),
        ViewUtils         = require("utils/ViewUtils"),
        KeyEvent          = require("utils/KeyEvent");

    var DOM = Preact.DOM;

    /**
     * @private
     * @type {Immutable.Map}
     *
     * Stores the file tree extensions for adding classes and icons. The keys of the map
     * are the "categories" of the extensions and values are vectors of the callback functions.
     */
    var _extensions = Immutable.Map();

     /**
     * @private
     * @type {string}
     *
     * Stores the path of the currently dragged item in the filetree.
     */
    var _draggedItemPath;


    // Constants

    // Time range from first click to second click to invoke renaming.
    const RIGHT_MOUSE_BUTTON    = 2,
        LEFT_MOUSE_BUTTON     = 0;

    const INDENTATION_WIDTH     = 10;

    /**
     * @private
     *
     * Returns the name of a file without its extension.
     *
     * @param {string} fullname The complete name of the file (not including the rest of the path)
     * @param {string} extension The file extension
     * @return {string} The fullname without the extension
     */
    function _getName(fullname, extension) {
        return extension !== "" ? fullname.substring(0, fullname.length - extension.length - 1) : fullname;
    }

    /**
     * Mixin that allows a component to compute the full path to its directory entry.
     * @private
     */
    var pathComputer = {
        /**
         * Computes the full path of the file represented by this input.
         * @private
         */
        myPath: function () {
            var result = this.props.parentPath + this.props.name;

            // Add trailing slash for directories
            if (!FileTreeViewModel.isFile(this.props.entry) && _.last(result) !== "/") {
                result += "/";
            }

            return result;
        }
    };

    /**
     * @private
     *
     * Gets an appropriate width given the text provided.
     *
     * @param {string} text Text to measure
     * @return {int} Width to use
     */
    function _measureText(text) {
        var measuringElement = $("<span />", { css: { "position": "absolute", "top": "-200px", "left": "-1000px", "visibility": "hidden", "white-space": "pre" } }).appendTo("body");
        measuringElement.text("pW" + text);
        var width = measuringElement.width();
        measuringElement.remove();
        return width;
    }

    /**
     * @private
     *
     * Create an appropriate div based "thickness" to indent the tree correctly.
     *
     * @param {int} depth The depth of the current node.
     * @return {PreactComponent} The resulting div.
     */
    function _createThickness(depth) {
        return DOM.div({
            style: {
                display: "inline-block",
                width: INDENTATION_WIDTH * depth
            }
        });
    }

    /**
     * @private
     *
     * Create, and indent correctly, the arrow icons used for the folders.
     *
     * @param {int} depth The depth of the current node.
     * @return {PreactComponent} The resulting ins.
     */
    function _createAlignedIns(depth) {
        return DOM.ins({
            className: "jstree-icon",
            style: {
                marginLeft: INDENTATION_WIDTH * depth
            }
        });
    }

    /**
     * This is a mixin that provides rename input behavior. It is responsible for taking keyboard input
     * and invoking the correct action based on that input.
     * @private
     */
    var renameBehavior = {
        /**
         * Stop clicks from propagating so that clicking on the rename input doesn't
         * cause directories to collapse.
         * @private
         */
        handleClick: function (e) {
            e.stopPropagation();
            if (e.button !== LEFT_MOUSE_BUTTON) {
                e.preventDefault();
            }
        },

        /**
         * If the user presses enter or escape, we either successfully complete or cancel, respectively,
         * the rename or create operation that is underway.
         * @private
         */
        handleKeyDown: function (e) {
            this.props.actions.setRenameValue(this.props.parentPath + this.refs.name.value.trim());
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                this.props.actions.cancelRename();
            } else if (e.keyCode === KeyEvent.DOM_VK_RETURN) {
                this.props.actions.performRename();
            }
        },

        /**
         * The rename or create operation can be completed or canceled by actions outside of
         * this component, so we keep the model up to date by sending every update via an action.
         * @private
         */
        handleInput: function (e) {
            this.props.actions.setRenameValue(this.props.parentPath + this.refs.name.value.trim());

            if (e.keyCode !== KeyEvent.DOM_VK_LEFT &&
                    e.keyCode !== KeyEvent.DOM_VK_RIGHT) {
                // update the width of the input field
                var node = this.refs.name,
                    newWidth = _measureText(node.value);
                $(node).width(newWidth);
            }
        },

        /**
         * If we leave the field for any reason, complete the rename.
         * @private
         */
        handleBlur: function () {
            this.props.actions.performRename();
        }
    };

    /**
     * This is a mixin that provides drag and drop move function.
     * @private
     */
    var dragAndDrop = {
        handleDrag: function(e) {
            // Disable drag when renaming
            if (this.props.entry.get("rename")) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            // In newer CEF versions, the drag and drop data from the event
            // (i.e. e.dataTransfer.getData) cannot be used to read data in dragOver event,
            // so store the drag and drop data in a global variable to read it in the dragOver
            // event.
            _draggedItemPath = this.myPath();

            // Pass the dragged item path.
            e.dataTransfer.setData("text", JSON.stringify({
                path: _draggedItemPath
            }));

            this.props.actions.dragItem(this.myPath());

            this.setDragImage(e);
            e.stopPropagation();
        },
        // dropped onto a folder 
        handleDrop: async function(e) {
            var data = e.dataTransfer.getData("text");
            this.setDraggedOver(false);
            this.clearDragTimeout();     
            e.preventDefault();       
            e.stopPropagation();

            if (data.length === 0) {
                // came from outside of the filetreeview (from the desktop)
                let item = e.dataTransfer.items[0];
                if (item.kind === "file") {                    
                    const fileHandle = await item.getAsFileSystemHandle();
                    const file = await fileHandle.getFile();
                    let path = this.myPath() + file.name;
                    fs.writeFile(path, await file.arrayBuffer(), null, ()=>{});
                }
            } else {
                data = JSON.parse(data);
                this.props.actions.moveItem(data.path, this.myPath());
            }


            
        },

        handleDragEnd: function(e) {
            this.clearDragTimeout();
        },

        handleDragOver: function(e) {
            var data = e.dataTransfer.getData("text"),
                path;

            if (data) {
                path = JSON.parse(data).path;
            } else {
                path = _draggedItemPath;
            }

            if (path === this.myPath() || FileUtils.getParentPath(path) === this.myPath()) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            var self = this;
            this.setDraggedOver(true);

            // Open the directory tree when item is dragged over a directory
            if (!this.dragOverTimeout) {
                this.dragOverTimeout = window.setTimeout(function() {
                    self.props.actions.setDirectoryOpen(self.myPath(), true);
                    self.dragOverTimeout = null;
                }, 800);
            }

            e.preventDefault(); // Allow the drop
            e.stopPropagation();
        },

        handleDragLeave: function(e) {
            this.setDraggedOver(false);
            this.clearDragTimeout();
        },

        clearDragTimeout: function() {
            if (this.dragOverTimeout) {
                clearTimeout(this.dragOverTimeout);
                this.dragOverTimeout = null;
            }
        },
        setDraggedOver: function(draggedOver) {
            if (this.state.draggedOver !== draggedOver) {
                this.setState({
                    draggedOver: draggedOver
                });
            }
        },

        setDragImage: function(e) {
            var div = window.document.createElement('div');
            div.textContent = this.props.name;
            div.classList.add('jstree-dragImage');
            window.document.body.appendChild(div);
            e.dataTransfer.setDragImage(div, -10, -10);
            setTimeout(function() {
                window.document.body.removeChild(div);
            }, 0);
        }
    };

    /**
     * @private
     *
     * This component presents an input field to the user for renaming a file.
     *
     * Props:
     * * parentPath: the full path of the directory containing this file
     * * name: the name of the file, including the extension
     * * actions: the action creator responsible for communicating actions the user has taken
     */
    var fileRenameInput = Preact.createFactory(Preact.createClass({
        mixins: [renameBehavior],

        /**
         * When this component is displayed, we scroll it into view and select the portion
         * of the filename that excludes the extension.
         */
        componentDidMount: function () {
            var fullname = this.props.name,
                extension = LanguageManager.getCompoundFileExtension(fullname);

            var node = this.refs.name;
            node.setSelectionRange(0, _getName(fullname, extension).length);
            node.focus(); // set focus on the rename input
            ViewUtils.scrollElementIntoView($("#project-files-container"), $(node), true);
        },

        render: function () {
            var width = _measureText(this.props.name);

            return DOM.input({
                className: "jstree-rename-input",
                type: "text",
                defaultValue: this.props.name,
                autoFocus: true,
                onKeyDown: this.handleKeyDown,
                onInput: this.handleInput,
                onClick: this.handleClick,
                onBlur: this.handleBlur,
                style: {
                    width: width
                },
                ref: "name"
            });
        }
    }));

    /**
     * @private
     *
     * This mixin handles right click (or control click on Mac) action to make a file
     * the "context" object for performing operations like rename.
     */
    var contextSettable = {

        /**
         * Send matching mouseDown events to the action creator as a setContext action.
         */
        handleMouseDown: function (e) {
            e.stopPropagation();
            if (e.button === RIGHT_MOUSE_BUTTON ||
                    (this.props.platform === "mac" && e.button === LEFT_MOUSE_BUTTON && e.ctrlKey)) {
                this.props.actions.setContext(this.myPath());
                e.preventDefault();
                return;
            }
            // Return true only for mouse down in rename mode.
            if (this.props.entry.get("rename")) {
                return;
            }
            this.selectNode(e);
        }
    };

    /**
     * @private
     *
     * Returns true if the value is defined (used in `.filter`)
     *
     * @param {Object} value value to test
     * @return {boolean} true if value is defined
     */
    function isDefined(value) {
        return value !== undefined;
    }

    /**
     * Mixin for components that support the "icons" and "addClass" extension points.
     * `fileNode` and `directoryNode` support this.
     * @private
     */
    var extendable = {

        /**
         * Calls the icon providers to get the collection of icons (most likely just one) for
         * the current file or directory.
         * @private
         * @return {Array.<PreactComponent>} icon components to render
         */
        getIcons: function () {
            let result= [],
                extensions = this.props.extensions;
            if (extensions && extensions.get("icons")) {
                let data = this.getDataForExtension();
                let iconProviders = extensions.get("icons").toArray();
                // the iconProviders list is sorted by priority at insertion
                for(let iconProviderCB of iconProviders){
                    try {
                        let iconResult = iconProviderCB(data);
                        if (iconResult && !Preact.isValidElement(iconResult)) {
                            iconResult = Preact.DOM.span({
                                dangerouslySetInnerHTML: {
                                    __html: $(iconResult)[0].outerHTML
                                }
                            });
                        }
                        // by this point, returns either undefined or a Preact object
                        if(iconResult){
                            result.push(iconResult);
                            break;
                        }
                    } catch (e) {
                        console.error("Exception thrown in FileTreeView icon provider: " + e, e.stack);
                    }
                }
            }

            if (!result || result.length === 0) {
                result = [DOM.ins({
                    className: "jstree-icon"
                }, " ")];
            }
            return result;
        },

        /**
         * Calls the addClass providers to get the classes (in string form) to add for the current
         * file or directory.
         * @private
         * @param {string} classes Initial classes for this node
         * @return {string} classes for the current node
         */
        getClasses: function (classes) {
            let extensions = this.props.extensions;

            if (extensions && extensions.get("addClass")) {
                let data = this.getDataForExtension();
                let classProviders = extensions.get("addClass").toArray();
                let succeededPriority = null;
                // the classProviders list is sorted by priority at insertion
                for(let classProviderCB of classProviders){
                    if(succeededPriority !== null && (succeededPriority !== classProviderCB.priority)){
                        // we need to append all class of the same priority and break once we shift to lower priority.
                        break;
                    }
                    try{
                        let classResult = classProviderCB(data);
                        if(classResult){
                            classes = classes + " " + classResult;
                            succeededPriority = classProviderCB.priority;
                        }
                    } catch (e) {
                        console.error("Exception thrown in FileTreeView addClass provider: " + e, e.stack);
                    }
                }
            }

            return classes;
        }
    };

    /**
     * @private
     *
     * Component to display a file in the tree.
     *
     * Props:
     * * parentPath: the full path of the directory containing this file
     * * name: the name of the file, including the extension
     * * entry: the object with the relevant metadata for the file (whether it's selected or is the context file)
     * * actions: the action creator responsible for communicating actions the user has taken
     * * extensions: registered extensions for the file tree
     * * forceRender: causes the component to run render
     */
    var fileNode = Preact.createFactory(Preact.createClass({
        mixins: [contextSettable, pathComputer, extendable, dragAndDrop],

        /**
         * Ensures that we always have a state object.
         */
        getInitialState: function () {
            return {};
        },

        /**
         * Thanks to immutable objects, we can just do a start object identity check to know
         * whether or not we need to re-render.
         * @private
         */
        shouldComponentUpdate: function (nextProps, nextState) {
            return nextProps.forceRender ||
                this.props.entry !== nextProps.entry ||
                this.props.extensions !== nextProps.extensions;
        },

        /**
         * If this node is newly selected, scroll it into view. Also, move the selection or
         * context boxes as appropriate.
         * @private
         */
        componentDidUpdate: function (prevProps, prevState) {
            var wasSelected = prevProps.entry.get("selected"),
                isSelected  = this.props.entry.get("selected");

            if (isSelected && !wasSelected) {
                // TODO: This shouldn't really know about project-files-container
                // directly. It is probably the case that our Preact tree should actually
                // start with project-files-container instead of just the interior of
                // project-files-container and then the file tree will be one self-contained
                // functional unit.
                ViewUtils.scrollElementIntoView($("#project-files-container"), $(Preact.findDOMNode(this)), true);
            }
        },

        startRename: function () {
            if (!this.props.entry.get("rename")) {
                this.props.actions.startRename(this.myPath());
            }
        },

        /**
         * When the user clicks on the node, we'll either select it or, if they've clicked twice
         * with a bit of delay in between, we'll invoke the `startRename` action.
         * @private
         */
        handleClick: function (e) {
            // If we're renaming, allow the click to go through to the rename input.
            if (this.props.entry.get("rename")) {
                e.stopPropagation();
                return;
            }

            if (e.button !== LEFT_MOUSE_BUTTON) {
                return;
            }

            if (!(this.props.entry.get("selected") && !e.ctrlKey)) {
                var language = LanguageManager.getLanguageForPath(this.myPath()),
                    doNotOpen = false;
                if (language && language.isBinary() && "image" !== language.getId() &&
                        FileUtils.shouldOpenInExternalApplication(
                            FileUtils.getFileExtension(this.myPath()).toLowerCase()
                        )
                    ) {
                    doNotOpen = true;
                }
                this.props.actions.setSelected(this.myPath(), doNotOpen);
            }
            e.stopPropagation();
            e.preventDefault();
        },

        /**
         * select the current node in the file tree on mouse down event on files.
         * This is to increase click responsiveness of file tree.
         * @private
         */
        selectNode: function (e) {
            if (e.button !== LEFT_MOUSE_BUTTON) {
                return;
            }

            var language = LanguageManager.getLanguageForPath(this.myPath()),
                doNotOpen = false;
            if (language && language.isBinary() && "image" !== language.getId() &&
                FileUtils.shouldOpenInExternalApplication(
                    FileUtils.getFileExtension(this.myPath()).toLowerCase()
                )
            ) {
                doNotOpen = true;
            }
            this.props.actions.setSelected(this.myPath(), doNotOpen);
            this.render();
        },

        /**
         * When the user double clicks, we will select this file and add it to the working
         * set (via the `selectInWorkingSet` action.)
         * @private
         */
        handleDoubleClick: function () {
            if (!this.props.entry.get("rename")) {
                if (FileUtils.shouldOpenInExternalApplication(
                        FileUtils.getFileExtension(this.myPath()).toLowerCase()
                      )) {
                    this.props.actions.openWithExternalApplication(this.myPath());
                    return;
                }
                this.props.actions.selectInWorkingSet(this.myPath());
            }
        },

        /**
         * Create the data object to pass to extensions.
         * @private
         * @return {!{name:string, isFile:boolean, fullPath:string}} Data for extensions
         */
        getDataForExtension: function () {
            return {
                name: this.props.name,
                isFile: true,
                fullPath: this.myPath()
            };
        },

        render: function () {
            var fullname = this.props.name,
                extension = LanguageManager.getCompoundFileExtension(fullname),
                name = _getName(fullname, extension);

            // React automatically wraps content in a span element whereas preact doesn't, so do it manually
            if (name) {
                name = DOM.span({}, name);
            }

            if (extension) {
                extension = DOM.span({
                    className: "extension"
                }, "." + extension);
            }

            var nameDisplay,
                cx = Classnames;

            var fileClasses = cx({
                'jstree-clicked selected-node': this.props.entry.get("selected"),
                'context-node': this.props.entry.get("context")
            });

            var liArgs = [
                {
                    className: this.getClasses("jstree-leaf"),
                    onClick: this.handleClick,
                    onMouseDown: this.handleMouseDown,
                    onDoubleClick: this.handleDoubleClick,
                    draggable: true,
                    onDragStart: this.handleDrag
                },
                DOM.ins({
                    className: "jstree-icon"
                })
            ];

            var thickness = _createThickness(this.props.depth);

            if (this.props.entry.get("rename")) {
                liArgs.push(thickness);
                nameDisplay = fileRenameInput({
                    actions: this.props.actions,
                    entry: this.props.entry,
                    name: this.props.name,
                    parentPath: this.props.parentPath
                });
            } else {
                // Need to flatten the argument list because getIcons returns an array
                var aArgs = _.flatten([{
                    href: "#",
                    className: fileClasses
                }, thickness, this.getIcons(), name, extension]);
                nameDisplay = DOM.a.apply(DOM.a, aArgs);
            }

            liArgs.push(nameDisplay);

            return DOM.li.apply(DOM.li, liArgs);
        }
    }));

    /**
     * @private
     *
     * Creates a comparison function for sorting a directory's contents with directories
     * appearing before files.
     *
     * We're sorting the keys of the directory (the names) based partly on the values,
     * so we use a closure to capture the map itself so that we can look up the
     * values as needed.
     *
     * @param {Immutable.Map} contents The directory's contents
     * @return {function(string,string)} Comparator that sorts directories first.
     */
    function _buildDirsFirstComparator(contents) {
        function _dirsFirstCompare(a, b) {
            var aIsFile = FileTreeViewModel.isFile(contents.get(a)),
                bIsFile = FileTreeViewModel.isFile(contents.get(b));

            if (!aIsFile && bIsFile) {
                return -1;
            } else if (aIsFile && !bIsFile) {
                return 1;
            }
            return FileUtils.compareFilenames(a, b);

        }
        return _dirsFirstCompare;
    }

    /**
     * @private
     *
     * Sort a directory either alphabetically or with subdirectories listed first.
     *
     * @param {Immutable.Map} contents the directory's contents
     * @param {boolean} dirsFirst true to sort subdirectories first
     * @return {Immutable.Map} sorted mapping
     */
    function _sortDirectoryContents(contents, dirsFirst) {
        if (dirsFirst) {
            return contents.keySeq().sort(_buildDirsFirstComparator(contents));
        }
        return contents.keySeq().sort(FileUtils.compareFilenames);

    }

    // Forward references to keep JSLint happy.
    var directoryNode, directoryContents;

    /**
     * @private
     *
     * Component that provides the input for renaming a directory.
     *
     * Props:
     * * parentPath: the full path of the directory containing this file
     * * name: the name of the file, including the extension
     * * actions: the action creator responsible for communicating actions the user has taken
     */
    var directoryRenameInput = Preact.createFactory(Preact.createClass({
        mixins: [renameBehavior],

        /**
         * When this component is displayed, we scroll it into view and select the folder name.
         */
        componentDidMount: function () {
            var fullname = this.props.name;

            var node = this.refs.name;
            node.setSelectionRange(0, fullname.length);
            node.focus(); // set focus on the rename input
            ViewUtils.scrollElementIntoView($("#project-files-container"), $(node), true);
        },

        render: function () {
            var width = _measureText(this.props.name);

            return DOM.input({
                className: "jstree-rename-input",
                type: "text",
                defaultValue: this.props.name,
                autoFocus: true,
                onKeyDown: this.handleKeyDown,
                onInput: this.handleInput,
                onBlur: this.handleBlur,
                style: {
                    width: width
                },
                onClick: this.handleClick,
                ref: "name"
            });
        }
    }));

    /**
     * @private
     *
     * Displays a directory (but not its contents) in the tree.
     *
     * Props:
     * * parentPath: the full path of the directory containing this file
     * * name: the name of the directory
     * * entry: the object with the relevant metadata for the file (whether it's selected or is the context file)
     * * actions: the action creator responsible for communicating actions the user has taken
     * * sortDirectoriesFirst: whether the directories should be displayed first when listing the contents of a directory
     * * extensions: registered extensions for the file tree
     * * forceRender: causes the component to run render
     */
    directoryNode = Preact.createFactory(Preact.createClass({
        mixins: [contextSettable, pathComputer, extendable, dragAndDrop],

        getInitialState: function() {
            return {
                draggedOver: false
            };
        },

        /**
         * We need to update this component if the sort order changes or our entry object
         * changes. Thanks to immutability, if any of the directory contents change, our
         * entry object will change.
         * @private
         */
        shouldComponentUpdate: function (nextProps, nextState) {
            return nextProps.forceRender ||
                this.props.entry !== nextProps.entry ||
                this.props.sortDirectoriesFirst !== nextProps.sortDirectoriesFirst ||
                this.props.extensions !== nextProps.extensions ||
                (nextState !== undefined && this.state.draggedOver !== nextState.draggedOver);
        },

        /**
         * If you click on a directory, it will toggle between open and closed.
         * @private
         */
        handleClick: function (event) {
            if (this.props.entry.get("rename")) {
                event.stopPropagation();
                return;
            }

            if (event.button !== LEFT_MOUSE_BUTTON
                || (brackets.platform === "mac" && event.ctrlKey)) { // in mac ctrl-click is context menu
                return;
            }

            var isOpen = this.props.entry.get("open"),
                setOpen = isOpen ? false : true;

            if (event.metaKey || event.ctrlKey) {
                // ctrl-alt-click toggles this directory and its children
                if (event.altKey) {
                    if (setOpen) {
                        // when opening, we only open the immediate children because
                        // opening a whole subtree could be really slow (consider
                        // a `node_modules` directory, for example).
                        this.props.actions.toggleSubdirectories(this.myPath(), setOpen);
                        this.props.actions.setDirectoryOpen(this.myPath(), setOpen);
                    } else {
                        // When closing, we recursively close the whole subtree.
                        this.props.actions.closeSubtree(this.myPath());
                    }
                } else {
                    // ctrl-click toggles the sibling directories
                    this.props.actions.toggleSubdirectories(this.props.parentPath, setOpen);
                }
            } else {
                // directory toggle with no modifier
                this.props.actions.setDirectoryOpen(this.myPath(), setOpen);
            }
            event.stopPropagation();
            event.preventDefault();
        },

        /**
         * select the current node in the file tree
         * @private
         */
        selectNode: function (e) {
            // Do nothing for folders on keydown event. Only expand the file tree on click event
            // to prevent jarring directory accordion expansion in ui.
        },

        /**
         * Create the data object to pass to extensions.
         *
         * @return {{name: {string}, isFile: {boolean}, fullPath: {string}}} Data for extensions
         * @private
         */
        getDataForExtension: function () {
            return {
                name: this.props.name,
                isFile: false,
                fullPath: this.myPath()
            };
        },

        render: function () {
            var entry = this.props.entry,
                nodeClass,
                childNodes,
                children = entry.get("children"),
                isOpen = entry.get("open");

            if (isOpen && children) {
                nodeClass = "open";
                childNodes = directoryContents({
                    depth: this.props.depth + 1,
                    parentPath: this.myPath(),
                    contents: children,
                    extensions: this.props.extensions,
                    actions: this.props.actions,
                    forceRender: this.props.forceRender,
                    platform: this.props.platform,
                    sortDirectoriesFirst: this.props.sortDirectoriesFirst
                });
            } else {
                nodeClass = "closed";
            }

            var nameDisplay,
                cx = Classnames;

            var directoryClasses = cx({
                'jstree-clicked sidebar-selection': entry.get("selected"),
                'context-node': entry.get("context")
            });

            var nodeClasses = "jstree-" + nodeClass;
            if (this.state.draggedOver) {
                nodeClasses += " jstree-draggedOver";
            }

            var liArgs = [
                {
                    className: this.getClasses(nodeClasses),
                    onClick: this.handleClick,
                    onMouseDown: this.handleMouseDown,
                    draggable: true,
                    onDragStart: this.handleDrag,
                    onDrop: this.handleDrop,
                    onDragEnd: this.handleDragEnd,
                    onDragOver: this.handleDragOver,
                    onDragLeave: this.handleDragLeave
                },
                _createAlignedIns(this.props.depth)
            ];

            var thickness = _createThickness(this.props.depth);

            if (entry.get("rename")) {
                liArgs.push(thickness);
                nameDisplay = directoryRenameInput({
                    actions: this.props.actions,
                    entry: entry,
                    name: this.props.name,
                    parentPath: this.props.parentPath
                });
            } else {
                // React automatically wraps content in a span element whereas preact doesn't, so do it manually
                if (this.props.name) {
                    var name = DOM.span({}, this.props.name);
                }

                // Need to flatten the arguments because getIcons returns an array
                var aArgs = _.flatten([{
                    href: "#",
                    className: directoryClasses
                }, thickness, this.getIcons(), name]);
                nameDisplay = DOM.a.apply(DOM.a, aArgs);
            }

            liArgs.push(nameDisplay);
            liArgs.push(childNodes);

            return DOM.li.apply(DOM.li, liArgs);
        }
    }));

    /**
     * @private
     *
     * Displays the contents of a directory.
     *
     * Props:
     * * isRoot: whether this directory is the root of the tree
     * * parentPath: the full path of the directory containing this file
     * * contents: the map of name/child entry pairs for this directory
     * * actions: the action creator responsible for communicating actions the user has taken
     * * sortDirectoriesFirst: whether the directories should be displayed first when listing the contents of a directory
     * * extensions: registered extensions for the file tree
     * * forceRender: causes the component to run render
     */
    directoryContents = Preact.createFactory(Preact.createClass({

        /**
         * Need to re-render if the sort order or the contents change.
         */
        shouldComponentUpdate: function (nextProps, nextState) {
            return nextProps.forceRender ||
                this.props.contents !== nextProps.contents ||
                this.props.sortDirectoriesFirst !== nextProps.sortDirectoriesFirst ||
                this.props.extensions !== nextProps.extensions;
        },

        render: function () {
            var extensions = this.props.extensions,
                iconClass = extensions && extensions.get("icons") ? "jstree-icons" : "jstree-no-icons",
                ulProps = this.props.isRoot ? {
                    className: "jstree-brackets jstree-no-dots " + iconClass
                } : null;

            var contents = this.props.contents,
                namesInOrder = _sortDirectoryContents(contents, this.props.sortDirectoriesFirst);

            return DOM.ul(ulProps, namesInOrder.map(function (name) {
                var entry = contents.get(name);

                if (FileTreeViewModel.isFile(entry)) {
                    return fileNode({
                        depth: this.props.depth,
                        parentPath: this.props.parentPath,
                        name: name,
                        entry: entry,
                        actions: this.props.actions,
                        extensions: this.props.extensions,
                        forceRender: this.props.forceRender,
                        platform: this.props.platform,
                        key: name
                    });
                }
                return directoryNode({
                    depth: this.props.depth,
                    parentPath: this.props.parentPath,
                    name: name,
                    entry: entry,
                    actions: this.props.actions,
                    extensions: this.props.extensions,
                    sortDirectoriesFirst: this.props.sortDirectoriesFirst,
                    forceRender: this.props.forceRender,
                    platform: this.props.platform,
                    key: name
                });

            }.bind(this)).toArray());
        }
    }));

    /**
     * Displays the absolutely positioned box for the selection or context in the
     * file tree. Its position is determined by passed-in info about the scroller in which
     * the tree resides and the top of the selected node (as reported by the node itself).
     *
     * Props:
     * * selectionViewInfo: Immutable.Map with width, scrollTop, scrollLeft and offsetTop for the tree container
     * * visible: should this be visible now
     * * selectedClassName: class name applied to the element that is selected
     * @private
     */
    var fileSelectionBox = Preact.createFactory(Preact.createClass({
        /**
         * When the component has updated in the DOM, reposition it to where the currently
         * selected node is located now.
         */
        componentDidUpdate: function () {
            if (!this.props.visible) {
                return;
            }

            var node = Preact.findDOMNode(this),
                selectedNode = $(node.parentNode).find(this.props.selectedClassName),
                selectionViewInfo = this.props.selectionViewInfo;

            if (selectedNode.length === 0) {
                return;
            }

            node.style.top = selectedNode.offset().top - selectionViewInfo.get("offsetTop") + selectionViewInfo.get("scrollTop") - selectedNode.position().top + "px";
        },

        render: function () {
            var selectionViewInfo = this.props.selectionViewInfo,
                left = selectionViewInfo.get("scrollLeft"),
                width = selectionViewInfo.get("width"),
                scrollWidth = selectionViewInfo.get("scrollWidth");

            return DOM.div({
                style: {
                    overflow: "auto",
                    left: left,
                    display: this.props.visible ? "block" : "none"
                },
                className: this.props.className
            });
        }
    }));

    /**
     * On Windows and Linux, the selection bar in the tree does not extend over the scroll bar.
     * The selectionExtension sits on top of the scroll bar to make the selection bar appear to span the
     * whole width of the sidebar.
     *
     * Props:
     * * selectionViewInfo: Immutable.Map with width, scrollTop, scrollLeft and offsetTop for the tree container
     * * visible: should this be visible now
     * * selectedClassName: class name applied to the element that is selected
     * * className: class to be applied to the extension element
     * @private
     */
    var selectionExtension = Preact.createFactory(Preact.createClass({
        /**
         * When the component has updated in the DOM, reposition it to where the currently
         * selected node is located now.
         */
        componentDidUpdate: function () {
            if (!this.props.visible) {
                return;
            }

            var node = Preact.findDOMNode(this),
                selectedNode = $(node.parentNode).find(this.props.selectedClassName).closest("li"),
                selectionViewInfo = this.props.selectionViewInfo;

            if (selectedNode.length === 0) {
                return;
            }

            var top = selectedNode.offset().top,
                baselineHeight = node.dataset.initialHeight,
                height = baselineHeight,
                scrollerTop = selectionViewInfo.get("offsetTop");

            if (!baselineHeight) {
                baselineHeight = $(node).outerHeight();
                node.dataset.initialHeight = baselineHeight;
                height = baselineHeight;
            }

            // Check to see if the selection is completely scrolled out of view
            // to prevent the extension from appearing in the working set area.
            if (top < scrollerTop - baselineHeight) {
                node.style.display = "none";
                return;
            }

            node.style.display = "block";

            // The selectionExtension sits on top of the other nodes
            // so we need to shrink it if only part of the selection node is visible
            if (top < scrollerTop) {
                var difference = scrollerTop - top;
                top += difference;
                height = parseInt(height, 10);
                height -= difference;
            }

            node.style.top = top + "px";
            node.style.height = height + "px";
            node.style.left = selectionViewInfo.get("width") - $(node).outerWidth() + "px";
        },

        render: function () {
            return DOM.div({
                style: {
                    display: this.props.visible ? "block" : "none"
                },
                className: this.props.className
            });
        }
    }));

    /**
     * @private
     *
     * This is the root component of the file tree.
     *
     * Props:
     * * treeData: the root of the tree (an Immutable.Map with the contents of the project root)
     * * sortDirectoriesFirst: whether the directories should be displayed first when listing the contents of a directory
     * * parentPath: the full path of the directory containing this file
     * * actions: the action creator responsible for communicating actions the user has taken
     * * extensions: registered extensions for the file tree
     * * forceRender: causes the component to run render
     * * platform: platform that Brackets is running on
     */
    var fileTreeView = Preact.createFactory(Preact.createClass({

        /**
         * Update for any change in the tree data or directory sorting preference.
         */
        shouldComponentUpdate: function (nextProps, nextState) {
            return nextProps.forceRender ||
                this.props.treeData !== nextProps.treeData ||
                this.props.sortDirectoriesFirst !== nextProps.sortDirectoriesFirst ||
                this.props.extensions !== nextProps.extensions ||
                this.props.selectionViewInfo !== nextProps.selectionViewInfo;
        },
        // dropped onto the root folder
        handleDrop: async function(e) {
            var data = e.dataTransfer.getData("text");
            
            if (data.length === 0) {
                // came from outside of the filetreeview (from the desktop)
                let item = e.dataTransfer.items[0];
                e.preventDefault();
                e.stopPropagation();
                if (item.kind === "file") {                    
                    const fileHandle = await item.getAsFileSystemHandle();
                    const file = await fileHandle.getFile();
                    let path = this.props.parentPath + file.name;
                    fs.writeFile(path, await file.arrayBuffer(), null, ()=>{});
                }
            } else {
                data = JSON.parse(data);
                this.props.actions.moveItem(data.path, this.props.parentPath);
                e.stopPropagation();
            }            
            
        },

        /**
         * Allow the Drop
         */
        handleDragOver: function(e) {
            e.preventDefault();
        },

        render: function () {
            var selectionBackground = fileSelectionBox({
                    ref: "selectionBackground",
                    selectionViewInfo: this.props.selectionViewInfo,
                    className: "filetree-selection",
                    visible: this.props.selectionViewInfo.get("hasSelection"),
                    selectedClassName: ".selected-node",
                    forceUpdate: true
                }),
                contextBackground = fileSelectionBox({
                    ref: "contextBackground",
                    selectionViewInfo: this.props.selectionViewInfo,
                    className: "filetree-context",
                    visible: this.props.selectionViewInfo.get("hasContext"),
                    selectedClassName: ".context-node",
                    forceUpdate: true
                }),
                extensionForSelection = selectionExtension({
                    selectionViewInfo: this.props.selectionViewInfo,
                    selectedClassName: ".selected-node",
                    visible: this.props.selectionViewInfo.get("hasSelection"),
                    forceUpdate: true,
                    className: "filetree-selection-extension"
                }),
                extensionForContext = selectionExtension({
                    selectionViewInfo: this.props.selectionViewInfo,
                    selectedClassName: ".context-node",
                    visible: this.props.selectionViewInfo.get("hasContext"),
                    forceUpdate: true,
                    className: "filetree-context-extension"
                }),
                contents = directoryContents({
                    isRoot: true,
                    depth: 1,
                    parentPath: this.props.parentPath,
                    sortDirectoriesFirst: this.props.sortDirectoriesFirst,
                    contents: this.props.treeData,
                    extensions: this.props.extensions,
                    actions: this.props.actions,
                    forceRender: this.props.forceRender,
                    platform: this.props.platform
                }),
                args = {
                    onDrop: this.handleDrop,
                    onDragOver: this.handleDragOver
                };


            return DOM.div(
                args,
                contents,
                selectionBackground,
                contextBackground,
                extensionForSelection,
                extensionForContext
            );
        }
    }));

    /**
     * Renders the file tree to the given element.
     *
     * @param {DOMNode|jQuery} element Element in which to render this file tree
     * @param {FileTreeViewModel} viewModel the data container
     * @param {Directory} projectRoot Directory object from which the fullPath of the project root is extracted
     * @param {ActionCreator} actions object with methods used to communicate events that originate from the user
     * @param {boolean} forceRender Run render on the entire tree (useful if an extension has new data that it needs rendered)
     * @param {string} platform mac, win, linux
     */
    function render(element, viewModel, projectRoot, actions, forceRender, platform) {
        if (!projectRoot) {
            return;
        }

        Preact.render(fileTreeView({
            treeData: viewModel.treeData,
            selectionViewInfo: viewModel.selectionViewInfo,
            sortDirectoriesFirst: viewModel.sortDirectoriesFirst,
            parentPath: projectRoot.fullPath,
            actions: actions,
            extensions: _extensions,
            platform: platform,
            forceRender: forceRender
        }),
              element);
    }

    /**
     * @private
     *
     * Add an extension for the given category (icons, addClass).
     *
     * @param {string} category Category to which the extension is being added
     * @param {function} callback The extension function itself
     */
    function _addExtension(category, callback) {
        if (!callback || typeof callback !== "function") {
            console.error("Attempt to add FileTreeView", category, "extension without a callback function");
            return;
        }
        var callbackList = _extensions.get(category);
        if (!callbackList) {
            callbackList = Immutable.List();
        }
        callbackList = callbackList.push(callback);
        callbackList = callbackList.sortBy((f) => -f.priority);
        _extensions = _extensions.set(category, callbackList);
    }

    /**
     * Adds an icon provider. The callback is invoked before each working set item is created, and can
     * return content to prepend to the item if it supports the icon.
     *
     * @param {!function(!{name:string, fullPath:string, isFile:boolean}):?string|jQuery|DOMNode} callback
     * Return a string representing the HTML, a jQuery object or DOM node, or undefined. If undefined,
     * nothing is prepended to the list item and the default or an available icon will be used.
     * @param {number} [priority] optional priority. 0 being lowest. The icons with the highest priority wins if there
     * are multiple callback providers attached. icon providers of the same priority first valid response wins.
     */
    function addIconProvider(callback, priority= 0) {
        callback.priority = priority;
        _addExtension("icons", callback);
    }

    /**
     * Adds a CSS class provider, invoked before each working set item is created or updated. When called
     * to update an existing item, all previously applied classes have been cleared.
     *
     * @param {!function(!{name:string, fullPath:string, isFile:boolean}):?string} callback
     * Return a string containing space-separated CSS class(es) to add, or undefined to leave CSS unchanged.
     * @param {number} [priority] optional priority. 0 being lowest. The class with the highest priority wins if there
     * are multiple callback classes attached. class providers of the same priority will be appended.
     */
    function addClassesProvider(callback, priority = 0) {
        callback.priority = priority;
        _addExtension("addClass", callback);
    }

    // Private API for testing
    exports._sortFormattedDirectory = _sortDirectoryContents;
    exports._fileNode = fileNode;
    exports._directoryNode = directoryNode;
    exports._directoryContents = directoryContents;
    exports._fileTreeView = fileTreeView;

    // Public API
    exports.addIconProvider = addIconProvider;
    exports.addClassesProvider = addClassesProvider;
    exports.render = render;

});
