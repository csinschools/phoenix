/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
 * Set of utilities for simple parsing of JS text.
 */
define(function (require, exports, module) {


    var _ = require("thirdparty/lodash"),
        Acorn = require("thirdparty/acorn/dist/acorn"),
        AcornLoose = require("thirdparty/acorn/dist/acorn_loose"),
        ASTWalker = require("thirdparty/acorn/dist/walk");

    // Load brackets modules
    var CodeMirror = require("thirdparty/CodeMirror/lib/codemirror"),
        Async = require("utils/Async"),
        DocumentManager = require("document/DocumentManager"),
        ChangedDocumentTracker = require("document/ChangedDocumentTracker"),
        FileSystem = require("filesystem/FileSystem"),
        FileUtils = require("file/FileUtils"),
        PerfUtils = require("utils/PerfUtils"),
        StringUtils = require("utils/StringUtils");

    /**
     * Tracks dirty documents between invocations of findMatchingFunctions.
     * @private
     * @type {ChangedDocumentTracker}
     */
    var _changedDocumentTracker = new ChangedDocumentTracker();

    /**
     * @private
     * Returns an object mapping function names to offset information for all functions in the specified text.
     * Offset information is an array since multiple functions with the same name can exist.
     *
     * @param {!string} text - The document text to be analyzed for function definitions.
     * @return {Object.<string, Array.<{offsetStart: number, offsetEnd: number}>>} - An object where each key is a function name,
     *     and the value is an array of objects containing offset information for each function.
     */
    function _findAllFunctionsInText(text) {
        var AST,
            results = {},
            functionName,
            resultNode,
            memberPrefix,
            match;

        PerfUtils.markStart(PerfUtils.JSUTILS_REGEXP);

        try {
            AST = Acorn.parse(text, { locations: true });
        } catch (e) {
            AST = AcornLoose.parse(text, { locations: true });
        }

        function _addResult(node, offset, prefix) {
            memberPrefix = prefix ? prefix + " - " : "";
            resultNode = node.id || node.key || node;
            functionName = resultNode.name;
            if (!Array.isArray(results[functionName])) {
                results[functionName] = [];
            }

            results[functionName].push(
                {
                    offsetStart: offset || node.start,
                    label: memberPrefix ? memberPrefix + functionName : null,
                    location: resultNode.loc
                }
            );
        }

        ASTWalker.simple(AST, {
            /*
                function <functionName> () {}
            */
            FunctionDeclaration: function (node) {
                // As acorn_loose marks identifier names with '✖' under erroneous declarations
                // we should have a check to discard such 'FunctionDeclaration' nodes
                if (node.id.name !== '✖') {
                    _addResult(node);
                }
            },
            /*
                class <className> () {}
            */
            ClassDeclaration: function (node) {
                _addResult(node);
                ASTWalker.simple(node, {
                    /*
                        class <className> () {
                            <methodName> () {

                            }
                        }
                    */
                    MethodDefinition: function (methodNode) {
                        _addResult(methodNode, methodNode.key.start, node.id.name);
                    }
                });
            },
            /*
                var <functionName> = function () {}

                or

                var <functionName> = () => {}
            */
            VariableDeclarator: function (node) {
                if (node.init && (node.init.type === "FunctionExpression" || node.init.type === "ArrowFunctionExpression")) {
                    _addResult(node);
                }
            },
            /*
                SomeFunction.prototype.<functionName> = function () {}
            */
            AssignmentExpression: function (node) {
                if (node.right && node.right.type === "FunctionExpression") {
                    if (node.left && node.left.type === "MemberExpression" && node.left.property) {
                        _addResult(node.left.property);
                    }
                }
            },
            /*
                {
                    <functionName>: function() {}
                }
            */
            Property: function (node) {
                if (node.value && node.value.type === "FunctionExpression") {
                    if (node.key && node.key.type === "Identifier") {
                        _addResult(node.key);
                    }
                }
            },
            /*
                <functionName>: function() {}
            */
            LabeledStatement: function (node) {
                if (node.body && node.body.type === "FunctionDeclaration") {
                    if (node.label) {
                        _addResult(node.label);
                    }
                }
            }
        });

        PerfUtils.addMeasurement(PerfUtils.JSUTILS_REGEXP);

        return results;
    }

    // Given the start offset of a function definition (before the opening brace), find
    // the end offset for the function (the closing "}"). Returns the position one past the
    // close brace. Properly ignores braces inside comments, strings, and regexp literals.
    function _getFunctionEndOffset(text, offsetStart) {
        var mode = CodeMirror.getMode({}, "javascript");
        var state = CodeMirror.startState(mode), stream, style, token;
        var curOffset = offsetStart, length = text.length, blockCount = 0, lineStart;
        var foundStartBrace = false;

        // Get a stream for the next line, and update curOffset and lineStart to point to the
        // beginning of that next line. Returns false if we're at the end of the text.
        function nextLine() {
            if (stream) {
                curOffset++; // account for \n
                if (curOffset >= length) {
                    return false;
                }
            }
            lineStart = curOffset;
            var lineEnd = text.indexOf("\n", lineStart);
            if (lineEnd === -1) {
                lineEnd = length;
            }
            stream = new CodeMirror.StringStream(text.slice(curOffset, lineEnd));
            return true;
        }

        // Get the next token, updating the style and token to refer to the current
        // token, and updating the curOffset to point to the end of the token (relative
        // to the start of the original text).
        function nextToken() {
            if (curOffset >= length) {
                return false;
            }
            if (stream) {
                // Set the start of the next token to the current stream position.
                stream.start = stream.pos;
            }
            while (!stream || stream.eol()) {
                if (!nextLine()) {
                    return false;
                }
            }
            style = mode.token(stream, state);
            token = stream.current();
            curOffset = lineStart + stream.pos;
            return true;
        }

        while (nextToken()) {
            if (style !== "comment" && style !== "regexp" && style !== "string" && style !== "string-2") {
                if (token === "{") {
                    foundStartBrace = true;
                    blockCount++;
                } else if (token === "}") {
                    blockCount--;
                }
            }

            // blockCount starts at 0, so we don't want to check if it hits 0
            // again until we've actually gone past the start of the function body.
            if (foundStartBrace && blockCount <= 0) {
                return curOffset;
            }
        }

        // Shouldn't get here, but if we do, return the end of the text as the offset.
        return length;
    }

    /**
     * @private
     * Computes function offsetEnd, lineStart and lineEnd. Appends a result record to rangeResults.
     * @param {!Document} doc
     * @param {!string} functionName
     * @param {!Array.<{offsetStart: number, offsetEnd: number}>} functions
     * @param {!Array.<{document: Document, name: string, lineStart: number, lineEnd: number}>} rangeResults
     */
    function _computeOffsets(doc, functionName, functions, rangeResults) {
        var text = doc.getText(),
            lines = StringUtils.getLines(text);

        functions.forEach(function (funcEntry) {
            if (!funcEntry.offsetEnd) {
                PerfUtils.markStart(PerfUtils.JSUTILS_END_OFFSET);

                funcEntry.offsetEnd = _getFunctionEndOffset(text, funcEntry.offsetStart);
                funcEntry.lineStart = StringUtils.offsetToLineNum(lines, funcEntry.offsetStart);
                funcEntry.lineEnd = StringUtils.offsetToLineNum(lines, funcEntry.offsetEnd);

                PerfUtils.addMeasurement(PerfUtils.JSUTILS_END_OFFSET);
            }

            rangeResults.push({
                document: doc,
                name: functionName,
                lineStart: funcEntry.lineStart,
                lineEnd: funcEntry.lineEnd
            });
        });
    }

    /**
     * @private
     * Read a file and build a function list. Result is cached in fileInfo.
     * @param {!FileInfo} fileInfo File to parse
     * @param {!$.Deferred} result Deferred to resolve with all functions found and the document
     */
    function _readFile(fileInfo, result) {
        DocumentManager.getDocumentForPath(fileInfo.fullPath)
            .done(function (doc) {
                var allFunctions = _findAllFunctionsInText(doc.getText());

                // Cache the result in the fileInfo object
                fileInfo.JSUtils = {};
                fileInfo.JSUtils.functions = allFunctions;
                fileInfo.JSUtils.timestamp = doc.diskTimestamp;

                result.resolve({ doc: doc, functions: allFunctions });
            })
            .fail(function (error) {
                result.reject(error);
            });
    }

    /**
     * Determines if the document function cache is up to date.
     * @private
     * @param {FileInfo} fileInfo
     * @return {$.Promise} A promise resolved with true with true when a function cache is available for the document. Resolves
     *   with false when there is no cache or the cache is stale.
     */
    function _shouldGetFromCache(fileInfo) {
        var result = new $.Deferred(),
            isChanged = _changedDocumentTracker.isPathChanged(fileInfo.fullPath);

        if (isChanged && fileInfo.JSUtils) {
            // See if it's dirty and in the working set first
            var doc = DocumentManager.getOpenDocumentForPath(fileInfo.fullPath);

            if (doc && doc.isDirty) {
                result.resolve(false);
            } else {
                // If a cache exists, check the timestamp on disk
                var file = FileSystem.getFileForPath(fileInfo.fullPath);

                file.stat(function (err, stat) {
                    if (!err) {
                        result.resolve(fileInfo.JSUtils.timestamp.getTime() === stat.mtime.getTime());
                    } else {
                        result.reject(err);
                    }
                });
            }
        } else {
            // Use the cache if the file did not change and the cache exists
            result.resolve(!isChanged && fileInfo.JSUtils);
        }

        return result.promise();
    }

    /**
     * @private
     * Computes the line start and line end for each matched function.
     *
     * @param {!Array.<{doc: Document, fileInfo: FileInfo, functions: Array.<{offsetStart: number, offsetEnd: number}>}>} docEntries - 
     *     An array of document entries, each containing a Document object, associated FileInfo, 
     *     and an array of function offsets.
     * @param {!string} functionName - The name of the function for which to compute the line ranges.
     * @param {!Array.<{document: Document, name: string, lineStart: number, lineEnd: number}>} rangeResults - 
     *     An array that will be populated with results, each containing the Document, 
     *     function name, line start, and line end.
     * @return {$.Promise} A promise that resolves with an array of document ranges to populate a MultiRangeInlineEditor.
     */
    function _getOffsetsForFunction(docEntries, functionName) {
        // Filter for documents that contain the named function
        var result = new $.Deferred(),
            matchedDocuments = [],
            rangeResults = [];

        docEntries.forEach(function (docEntry) {
            // Need to call _.has here since docEntry.functions could have an
            // entry for "hasOwnProperty", which results in an error if trying
            // to invoke docEntry.functions.hasOwnProperty().
            if (_.has(docEntry.functions, functionName)) {
                var functionsInDocument = docEntry.functions[functionName];
                matchedDocuments.push({ doc: docEntry.doc, fileInfo: docEntry.fileInfo, functions: functionsInDocument });
            }
        });

        Async.doInParallel(matchedDocuments, function (docEntry) {
            var doc = docEntry.doc,
                oneResult = new $.Deferred();

            // doc will be undefined if we hit the cache
            if (!doc) {
                DocumentManager.getDocumentForPath(docEntry.fileInfo.fullPath)
                    .done(function (fetchedDoc) {
                        _computeOffsets(fetchedDoc, functionName, docEntry.functions, rangeResults);
                    })
                    .always(function () {
                        oneResult.resolve();
                    });
            } else {
                _computeOffsets(doc, functionName, docEntry.functions, rangeResults);
                oneResult.resolve();
            }

            return oneResult.promise();
        }).done(function () {
            result.resolve(rangeResults);
        });

        return result.promise();
    }

    /**
     * Resolves with a record containing the Document or FileInfo and an Array of all
     * function names with offsets for the specified file. Results may be cached.
     * @private
     * @param {FileInfo} fileInfo
     * @return {$.Promise} A promise resolved with a document info object that
     *   contains a map of all function names from the document and each function's start offset.
     */
    function _getFunctionsForFile(fileInfo) {
        var result = new $.Deferred();

        _shouldGetFromCache(fileInfo)
            .done(function (useCache) {
                if (useCache) {
                    // Return cached data. doc property is undefined since we hit the cache.
                    // _getOffsets() will fetch the Document if necessary.
                    result.resolve({/*doc: undefined,*/fileInfo: fileInfo, functions: fileInfo.JSUtils.functions });
                } else {
                    _readFile(fileInfo, result);
                }
            }).fail(function (err) {
                result.reject(err);
            });

        return result.promise();
    }

    /**
     * @private
     * Get all functions for each FileInfo.
     * @param {Array.<FileInfo>} fileInfos
     * @return {$.Promise} A promise resolved with an array of document info objects that each
     *   contain a map of all function names from the document and each function's start offset.
     */
    function _getFunctionsInFiles(fileInfos) {
        var result = new $.Deferred(),
            docEntries = [];

        PerfUtils.markStart(PerfUtils.JSUTILS_GET_ALL_FUNCTIONS);

        Async.doInParallel(fileInfos, function (fileInfo) {
            var oneResult = new $.Deferred();

            _getFunctionsForFile(fileInfo)
                .done(function (docInfo) {
                    docEntries.push(docInfo);
                })
                .always(function (error) {
                    // If one file fails, continue to search
                    oneResult.resolve();
                });

            return oneResult.promise();
        }).always(function () {
            // Reset ChangedDocumentTracker now that the cache is up to date.
            _changedDocumentTracker.reset();

            PerfUtils.addMeasurement(PerfUtils.JSUTILS_GET_ALL_FUNCTIONS);
            result.resolve(docEntries);
        });

        return result.promise();
    }

    /**
     * Return all functions that have the specified name, searching across all the given files.
     *
     * @param {!String} functionName The name to match.
     * @param {!Array.<File>} fileInfos The array of files to search.
     * @param {boolean=} keepAllFiles If true, don't ignore non-javascript files.
     * @return {$.Promise} that will be resolved with an Array of objects containing the
     *      source document, start line, and end line (0-based, inclusive range) for each matching function list.
     *      Does not addRef() the documents returned in the array.
     */
    function findMatchingFunctions(functionName, fileInfos, keepAllFiles) {
        var result = new $.Deferred(),
            jsFiles = [];

        if (!keepAllFiles) {
            // Filter fileInfos for .js files
            jsFiles = fileInfos.filter(function (fileInfo) {
                return FileUtils.getFileExtension(fileInfo.fullPath).toLowerCase() === "js";
            });
        } else {
            jsFiles = fileInfos;
        }

        // RegExp search (or cache lookup) for all functions in the project
        _getFunctionsInFiles(jsFiles).done(function (docEntries) {
            // Compute offsets for all matched functions
            _getOffsetsForFunction(docEntries, functionName).done(function (rangeResults) {
                result.resolve(rangeResults);
            });
        });

        return result.promise();
    }

    /**
     * Finds all instances of the specified searchName in "text".
     * Returns an Array of Objects with start and end properties.
     *
     * @param text {!String} JS text to search
     * @param searchName {!String} function name to search for
     * @return {{offset:number, functionName:string}} Array of objects containing the start offset for each matched function name.
     */
    function findAllMatchingFunctionsInText(text, searchName) {
        var allFunctions = _findAllFunctionsInText(text);
        var result = [];
        var lines = text.split("\n");

        _.forEach(allFunctions, function (functions, functionName) {
            if (functionName === searchName || searchName === "*") {
                functions.forEach(function (funcEntry) {
                    var endOffset = _getFunctionEndOffset(text, funcEntry.offsetStart);
                    result.push({
                        name: functionName,
                        label: funcEntry.label,
                        lineStart: StringUtils.offsetToLineNum(lines, funcEntry.offsetStart),
                        lineEnd: StringUtils.offsetToLineNum(lines, endOffset),
                        nameLineStart: funcEntry.location.start.line - 1,
                        nameLineEnd: funcEntry.location.end.line - 1,
                        columnStart: funcEntry.location.start.column,
                        columnEnd: funcEntry.location.end.column
                    });
                });
            }
        });

        return result;
    }

    PerfUtils.createPerfMeasurement("JSUTILS_GET_ALL_FUNCTIONS", "Parallel file search across project");
    PerfUtils.createPerfMeasurement("JSUTILS_REGEXP", "RegExp search for all functions");
    PerfUtils.createPerfMeasurement("JSUTILS_END_OFFSET", "Find end offset for a single matched function");

    exports.findAllMatchingFunctionsInText = findAllMatchingFunctionsInText;
    exports._getFunctionEndOffset = _getFunctionEndOffset; // For testing only
    exports.findMatchingFunctions = findMatchingFunctions;
});
