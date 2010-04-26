/**
 * Disqus.js
 * <p>A JavaScript library for Disqus API v1.1</p>
 *
 * @version 0.1 alpha
 * @author Ates Goral
 *
 * <p>Copyright (c) 2009 Ates Goral</p>
 * <p>http://magnetiq.com/</p>
 * <p>Licensed under the MIT license.
 * http://www.opensource.org/licenses/mit-license.php</p>
 *
 * <p>Can be used from a static HTML page, entirely on the client-side.
 * One caveat is that certain POST method API calls are rendered useless because
 * their results cannot be retrieved.</p>
 *
 * @requires jQuery
 * @see <a href="http://disqus.com/">Disqus</a>
 * @see <a href="http://jquery.com/">jQuery</a>
 *
 * @namespace disqus.js namespace
 */
var disqus = (function ($, logFn) {
    /** Counter to generate unique request identifiers */
    var apiCallCnt = 0;

    /** Stores user API key */
    var apiKey;

    ////////////////////////////////////////////////////////////////////////////
    // Private utilities
    ////////////////////////////////////////////////////////////////////////////
    
    /** Local logging helper */
    function log(s) {
        logFn && logFn(s);
    }

    /**
     * Extract callback and options arguments from the given arguments array,
     * based on the type and order of arguments:
     * <ul>
     * <li>The first Function encountered is used as the success/done callback.
     * </li>
     * <li>Second Function becomes the failure callback.</li>
     * <li>An Object becomes the options argument.</li>
     * <li>Arguments of other types are ignored.</li>
     * </ul>
     */
    function extractArgs(args) {
        var extracted = {};
        
        $.each(args, function (i, arg) {
            switch (arg.constructor) {
            case Function:
                extracted.successFn = extracted.successFn || arg;
                extracted.failureFn = !extracted.successFn && arg;
                break;
            case Object:
                extracted.options = arg;
            }
        });
        
        return extracted;
    }
    
    /**
     * Format date to ISO format
     */
    function formatDate(date) {
        function pad(n) {
            return n >9 ? n : "0" + n;
        }

        return [ date.getUTCFullYear(), "-", pad(date.getUTCMonth() + 1), "-",
            pad(date.getUTCDate() + 1), "T", pad(date.getUTCHours()), ":",
            pad(date.getUTCMinutes()) ].join("");
    }

    /**
     * Cross-domain GET through JSONP
     */
    function apiGet(args, apiMethod, params, processFn) {
        var apiCallRef = ++apiCallCnt;
        var handlerName = "_handler" + apiCallRef;
        var extracted = extractArgs(args);
        
        disqus[handlerName] = function (response) {
            delete disqus[handlerName];
            
            log(apiMethod + " (" + apiCallRef
                + ") "
                + (response.succeeded
                    ? "succeeded"
                    : "failed (" + response.code + ")"));

            if (response.succeeded) {
                extracted.successFn && extracted.successFn(
                    processFn ? processFn(response.message) : response.message);
            } else {
                extracted.failureFn && extracted.failureFn(response.code);
            }
        };

        log("Invoking " + apiMethod + " (" + apiCallRef + ")");

        $.ajax({
            url: "http://disqus.com/api/" + apiMethod + "/",
            dataType: "script",
            data: $.extend({
                api_version: "1.1",
                api_response_format: "jsonp:disqus." + handlerName
            }, params, extracted.options)
        });
    }
    
    /**
     * Cross-domain POST through form submit, with no access to response
     */
    function apiPost(args, apiMethod, params) {
        var apiCallRef = ++apiCallCnt;
        var targetName = "_target" + apiCallRef;
        var extracted = extractArgs(args);

        var $container = $('<div style="display: none"></div>');
        var $iframe = $('<iframe name="' + targetName + '"></iframe>');
        var $form = $('<form method="POST" target="' + targetName
            + '" action="http://disqus.com/api/' + apiMethod + '/"></form>');

        var data = $.extend({
            api_version: "1.1",
            api_response_format: "jsonp:void" // No return
        }, params, extracted.options);

        for (var p in data) {
            $form.append($('<input type="hidden" name="' + p
                + '" value="' + data[p] + '"/>'));
        }

        $("body").append($container.append($iframe).append($form));

        $iframe.load(function () {
            setTimeout(function () {
                log(apiMethod + " (" + apiCallRef + ") done");
                container.remove();
                extracted.successFn && extracted.successFn();
            }, 1);
        });
        
        log("Invoking " + apiMethod + " (" + apiCallRef + ")");

        $form.submit();
    }
    
    /**
     * Helper for API methods that require a forum API key.
     *
     * <p>If the API key for the forum is already known, the API
     * method will directly be invoked. Otherwise, a getForumApiKey call will be
     * made to get the key before the original API method is invoked.</p>
     *
     * @param {Function} apiCallFn A function that wraps an apiGet or apiPost
     *                             call with all the necessary arguments.
     * @param {Forum} forum The Forum object.
     * @param {Array} args The arguments array from the original API function
     *                     call on the target object.
     * @param {Forum|Thread} [target] The target object. Defaults to the Forum
     *                                object.
     */
    function requireForumApiKey(apiCallFn, forum, args, target) {
        // Have a forum API key already?
        if (forum.apiKey) {
            // Invoke the API call now
            apiCallFn.apply(target || forum, args);
        } else {
            // Defer until we get the API key
            forum.getForumApiKey(function (api_key) {
                forum.apiKey = api_key;
                apiCallFn.apply(target || forum, args);
            },
            function (code) {
                extractArgs(args).failureFn(code);
            });
        }
    }

    ////////////////////////////////////////////////////////////////////////////
    // Forum class
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Creates a new Forum
     * @class Represents a Disqus forum (or website)
     * @name Forum
     * @param {Number} [id] The forum id.
     */
    function Forum(id) {
        this.id = id;
    }

    /**
     * Get the API key for this Forum
     */
    Forum.prototype.getForumApiKey = function () {
        apiGet(arguments,
            "get_forum_api_key",
            { user_api_key: apiKey, forum_id: this.id });
        return this;
    };

    /**
     * @param {Object} [options] Object with optional parameters
       * @param {Number} [options.category_id] Filter entries by category
     * @param {Number} [options.limit] Number of entries that should be included
     *                                 in the response. Default is 25.
     * @param {Number} [options.start] Starting point for the query. Default is
     *                                 0.
     * @param {String[]} [options.filter] Type of entries that should be
     *                                    returned.
     * @param {String[]} [options.exclude] Type of entries that should be
     *                                     excluded from the response.
     */
    Forum.prototype.getForumPosts = function () {
        apiGet(arguments,
            "get_forum_posts",
            { user_api_key: apiKey, forum_id: this.id },
            function (message) {
                var posts = [];

                $.each(message, function (i, post_data) {
                    posts.push($.extend(new Post(), post_data, {
                        created_at: new Date(post_data.created_at)
                    }));
                });
                
                return posts;
            });
        return this;
    };
    
    Forum.prototype.getCategoriesList = function () {
        apiGet(arguments,
            "get_categories_list",
            { user_api_key: apiKey, forum_id: this.id },
            function (message) {
                var categories = [];

                $.each(message, function (i, category_data) {
                    categories.push($.extend(new Category(), category_data));
                });
                
                return categories;
            });
        return this;
    };
    
    /**
     * @param {Object} [options] Object with optional parameters
     * @param {Number} [options.category_id] Filter entries by their category.
     */
    Forum.prototype.getThreadList = function () {
        apiGet(arguments,
            "get_thread_list",
            { user_api_key: apiKey, forum_id: this.id },
            function (message) {
                var threads = [];

                $.each(message, function (i, thread_data) {
                    threads.push($.extend(new Thread(), thread_data, {
                        created_at: new Date(thread_data.created_at)
                    }));
                });
                
                return threads;
            });
        return this;
    };
    
    Forum.prototype.getUpdatedThreads = function (since) {
        apiGet(arguments,
            "get_updated_threads",
            { user_api_key: apiKey, forum_id: this.id,
                since: formatDate(since) },
            function (message) {
                var threads = [];

                $.each(message, function (i, thread_data) {
                    threads.push($.extend(new Thread(), thread_data, {
                        created_at: new Date(thread_data.created_at)
                    }));
                });
                
                return threads;
            });
        return this;
    };

    /**
     * Get or create thread by identifier
     *
     * This method tries to find a thread by its identifier and title. If there
     * is no such thread, the method creates it. In either case, the output
     * value is a thread object.
     *
     * @param {String} identifier Unique value (per forum) for a thread that is
     *                            used to keep be able to get data even if
     *                            permalink is changed.
     * @param {String} title If thread does not exist, the method will create it
     *                       with the specified title (can be an empty string if
     *                       you are sure that the thread exists)
     * @param {Object} [options] Object with optional parameters
     * @param {Number} [options.category_id] If thread does not exist, the
     *                                       method will create it in the
     *                                       specified category
     * @param {Function} [doneFn] Callback function to call when API call is
     *                            made. The outcome of this API call cannot be
     *                            known.
     */	
    Forum.prototype.threadByIdentifier = function (identifier, title) {
        requireForumApiKey(function () {
            apiPost(arguments,
                "thread_by_identifier",
                { forum_api_key: this.apiKey, identifier: identifier,
                    title: title });
        }, this, arguments);
        
        return this;
    };
    
    /**
     * @param {Object} [options] Object with optional parameters
     * @param {String} [options.partner_api_key]
     */      
    Forum.prototype.getThreadByUrl = function (url) {
        requireForumApiKey(function () {
            apiGet(arguments,
                "get_thread_by_url",
                { forum_api_key: this.apiKey, url: url },
                function (message) {
                    return $.extend(new Thread(), message, {
                        created_at: new Date(message.created_at)
                    });
                });
        }, this, arguments);
        
        return this;
    };
    
    ////////////////////////////////////////////////////////////////////////////
    // Category class
    ////////////////////////////////////////////////////////////////////////////
    
    /**
     * Creates a new Category
     * @class Represents a Disqus category
     * @name Category
     */
    function Category() {}
    
    ////////////////////////////////////////////////////////////////////////////
    // Thread class
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Creates a new Thread
     * @class Represents a Disqus discussion thread
     * @name Thread
     */
    function Thread() {}

    /**
     * Get a list of posts in a thread
     *
     * @param {Object} [options] Object with optional parameters
     * @param {Number} [options.limit] Number of entries that should be included
     *                                 in the response. Default is 25.
     * @param {Number} [options.start] Starting point for the query. Default is
     *                                 0.
     * @param {String[]} [options.filter] Type of entries that should be
     *                                    returned (new, spam or killed).
     * @param {String[]} [options.exclude] Type of entries that should be
     *                                     excluded from the response (new, spam
     *                                     or killed).
     */
    Thread.prototype.getThreadPosts = function () {
        apiGet(arguments,
            "get_thread_posts",
            { user_api_key: apiKey, thread_id: this.id },
            function (message) {
                var posts = [];

                $.each(message, function (i, post_data) {
                    posts.push($.extend(new Post(), post_data, {
                        created_at: new Date(post_data.created_at)
                    }));
                });
                
                return posts;
            });
        return this;    
    };
    
    /**
     * Update thread with values in the options argument.
     * @param {Object} options Object with optional parameters
     * @param {String} [options.title]
     * @param {Boolean} [options.allow_comments]
     * @param {String} [options.slug]
     * @param {String} [options.url]
     * @param {Function} [doneFn] Callback function to call when API call is
     *                            made. The outcome of this API call cannot be
     *                            known.
     */
    Thread.prototype.updateThread = function () {
        var forum = new Forum(this.forum); // todo: use factory for the chance
                                           // of the Forum already being there.
        requireForumApiKey(function () {
            apiPost(arguments,
                "update_thread",
                { forum_api_key: forum.apiKey, thread_id: this.thread_id });
        }, forum, arguments, this);

        return this;
    };
    
    /**
     * Create a new post (i.e. add a new comment)
     * @param {String} message
     * @param {String} author_name
     * @param {String} author_email
     * @param {Object} [options] Object with optional parameters
     * @param {String} [options.partner_api_key]
     * @param {Date} [options.created_at]
     * @param {String} [options.ip_address]
     * @param {String} [options.author_url]
     * @param {String} [options.parent_post]
     * @param {String} [options.state] Comment's state, must be one of:
     *                                 approved, unapproved, spam, killed
     * @param {Function} [doneFn] Callback function to call when API call is
     *                            made. The outcome of this API call cannot be
     *                            known.
     */
    Thread.prototype.createPost = function (message, author_name, author_email) {
        var forum = new Forum(this.forum);

        requireForumApiKey(function () {
            apiPost(arguments,
                "create_post",
                { forum_api_key: forum.apiKey, thread_id: this.thread_id,
                    message: message, author_name: author_name,
                    author_email: author_email });
        }, forum, arguments, this);

        return this;
    };

    ////////////////////////////////////////////////////////////////////////////
    // Post class
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Creates a new Post
     * @class Represents a Disqus discussion post
     * @name Post
     */
    function Post() {}
    
    /**
     * Delete this post or mark it as spam (or not spam)
     * @param {String} action Name of action to be performed. Value can be
     *                        "spam", "approve" or "kill".
     * @param {Function} [doneFn] Callback function to call when API call is
     *                            made. The outcome of this API call cannot be
     *                            known.
     */
    Post.prototype.moderatePost = function (action) {
        apiPost(arguments,
            "moderate_post",
            { user_api_key: apiKey, post_id: this.id,
                action: action });
    };

    ////////////////////////////////////////////////////////////////////////////
    // disqus namespace members
    ////////////////////////////////////////////////////////////////////////////

    /** @scope disqus */
    return {
        apiKeyUrl: "http://disqus.com/api/get_my_key/",
        
        setApiKey: function (api_key) {
            apiKey = api_key;
            return this;
        },
              
        /* Global API methods */

        getUserName: function () {
            apiPost(arguments,
                "get_user_name",
                { user_api_key: apiKey });
            return this;
        },
        
        getForumList: function () {
            apiGet(arguments,
                "get_forum_list",
                { user_api_key: apiKey },
                function (message) {
                    var forums = [];
                    
                    $.each(message, function (i, forum_data) {
                        forums.push($.extend(new Forum(), forum_data, {
                            created_at: new Date(forum_data.created_at)
                        }));
                    });

                    return forums;
                });
            return this;
        },
        
        getNumPosts: function (threadIds) {
            apiGet(arguments,
                "get_num_posts",
                { user_api_key: apiKey,
                    thread_ids: threadIds.toString() });
            return this;
        }
    };
})(jQuery, window.console && console.log);
