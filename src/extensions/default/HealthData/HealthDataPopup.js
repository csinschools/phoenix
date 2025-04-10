/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

define(function (require, exports, module) {

    // Load dependent modules
    const NotificationUI = brackets.getModule("widgets/NotificationUI"),
        Strings = brackets.getModule("strings");

    function showFirstLaunchTooltip() {
        const deferred = new $.Deferred();
        // hiding toast notifications for now
        /*
        NotificationUI.createToastFromTemplate(Strings.HEALTH_FIRST_POPUP_TITLE,
            `<div id="healthdata-firstlaunch-popup">${Strings.HEALTH_DATA_NOTIFICATION_MESSAGE}</div>`).done(deferred.resolve);
        */
        return deferred.promise();
    }

    exports.showFirstLaunchTooltip          = showFirstLaunchTooltip;
});
