/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

define(function (require, exports, module) {

    /**
     * Constants representing dialog IDs
     * These IDs are used to identify different types of dialogs
     *
     * @module DefaultDialogs
     */

    /**
     * ID for error dialog
     * @constant {string}
     */
    exports.DIALOG_ID_ERROR = "error-dialog";

    /**
     * ID for information dialog (currently uses the same template as DIALOG_ID_ERROR)
     * @constant {string}
     */
    exports.DIALOG_ID_INFO = "error-dialog"; // uses the same template for now--could be different in future

    /**
     * ID for save and close dialog
     * @constant {string}
     */
    exports.DIALOG_ID_SAVE_CLOSE = "save-close-dialog";

    /**
     * ID for `external change detected` dialog
     * @constant {string}
     */
    exports.DIALOG_ID_EXT_CHANGED = "ext-changed-dialog";

    /**
     * ID for `external deletion detected` dialog
     * @constant {string}
     */
    exports.DIALOG_ID_EXT_DELETED = "ext-deleted-dialog";

    /**
     * ID for `change extensions` dialog
     * @constant {string}
     */
    exports.DIALOG_ID_CHANGE_EXTENSIONS = "change-marked-extensions";

    /**
     * ID for `change extensions` dialog
     * @constant {string}
     */
    exports.DIALOG_ID_PROCESSING = "processing-dialog";    
});
