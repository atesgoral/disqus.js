/** @namespace disqus.js namespace */
var disqus = (function () {
	var apiCallCnt = 0;

    var settings = {
        logger: function () {}
    };

    function log(s) {
        settings.logger(s);
    }

	function distillArgs(args) {
		var distilled = {};
		
		$.each(args, function (i, arg) {
			switch (arg.constructor) {
			case Function:
				distilled.successFn = distilled.successFn || arg;
				distilled.failureFn = !distilled.successFn && arg;
				break;
			case Object:
				distilled.options = arg;
			}
		});
		
		return distilled;
	}
	
    function formatDate(date) {
        return "2009-03-30T15:41"; // UTC
    }

    function apiGet(args, apiMethod, params, processFn) {
        var apiCallRef = ++apiCallCnt;
        var handlerName = "_handler" + apiCallRef;
		var distilled = distillArgs(args);
        
        disqus[handlerName] = function (response) {
            delete disqus[handlerName];
            
            log(apiMethod + " (" + apiCallRef
                + ") "
                + (response.succeeded
                    ? "succeeded"
                    : "failed (" + response.code + ")"));

            if (response.succeeded) {
                distilled.successFn && distilled.successFn(
					processFn ? processFn(response.message) : response.message);
            } else {
                distilled.failureFn && distilled.failureFn(response.code);
            }
        };

        log("Invoking " + apiMethod + " (" + apiCallRef + ")");

        $.ajax({
            url: "http://disqus.com/api/" + apiMethod + "/",
            dataType: "script",
            data: $.extend({
                api_version: "1.1",
                api_response_format: "jsonp:disqus." + handlerName
            }, params, distilled.options)
        });
    }
	
    function apiPost(args, apiMethod, params) {
        var apiCallRef = ++apiCallCnt;
        var targetName = "_target" + apiCallRef;
		var distilled = distillArgs(args);

        var $container = $('<div style="display: none"></div>');
        var $iframe = $('<iframe name="' + targetName + '"></iframe>');
        var $form = $('<form method="POST" target="' + targetName
            + '" action="http://disqus.com/api/' + apiMethod + '/"></form>');

        var data = $.extend({
			api_version: "1.1",
			api_response_format: "jsonp:void" // No return
		}, params, distilled.options);

        for (var p in data) {
            $form.append($('<input type="hidden" name="' + p
                + '" value="' + data[p] + '"/>'));
        }

        $("body").append($container.append($iframe).append($form));

        $iframe.load(function () {
            setTimeout(function () {
                log(apiMethod + " (" + apiCallRef + ") done");
                container.remove();
                distilled.successFn && distilled.successFn();
            }, 1);
        });
        
        log("Invoking " + apiMethod + " (" + apiCallRef + ")");

        $form.submit();
    }
    
    /* Forum class */

    function Forum() {
    }
    
    /* Forum API methods */
    
    Forum.prototype.getForumApiKey = function () {
        apiGet(arguments,
			"get_forum_api_key",
            { user_api_key: settings.user_key, forum_id: this.id });
        return this;
    };

    /*    
    Optional arguments:

        * category_id — Filter entries by category
        * limit — Number of entries that should be included in the response. Default is 25.
        * start — Starting point for the query. Default is 0.
        * filter — Type of entries that should be returned.
        * exclude — Type of entries that should be excluded from the response.
    */
    Forum.prototype.getForumPosts = function () {
        apiGet(arguments,
			"get_forum_posts",
            { user_api_key: settings.user_key, forum_id: this.id },
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
            { user_api_key: settings.user_key, forum_id: this.id },
            function (message) {
                var categories = [];

                $.each(message, function (i, category_data) {
                    categories.push($.extend(new Category(), category_data));
                });
                
                return categories;
            });
        return this;
    };
    
    /*
    Optional arguments:

        * category_id — Filter entries by their category.
    */
    Forum.prototype.getThreadList = function () {
        apiGet(arguments,
			"get_thread_list",
            { user_api_key: settings.user_key, forum_id: this.id },
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
            { user_api_key: settings.user_key, forum_id: this.id,
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

    Forum.prototype.threadByIdentifier = function (identifier, title) {
        //apiPost(arguments, "thread_by_identifier"
    };
    
    /*
    Optional arguments:

        * partner_api_key
    */      
    Forum.prototype.getThreadByUrl = function (url) {
        var invoke = function () {
            apiGet(arguments,
				"get_thread_by_url",
                { forum_api_key: this.api_key, url: url },
				function (message) {
                    return $.extend(new Thread(), message, {
                        created_at: new Date(message.created_at)
                    });
				});
        };
        
		// Have a forum API key already?
        if (this.api_key) {
			// Invoke the API call now
            invoke.apply(this, arguments);
        } else {
			// Defer until we get the API key
			var forum = this;
			var args = arguments;

            this.getForumApiKey(function (api_key) {
                forum.api_key = api_key;
                invoke.apply(forum, args);
            },
			function (code) {
				distillArgs(args).failureFn(code);
			});
        }
        return this;
    };
    
    /* Category class */

    function Category() {
    }
    
    /* Thread class */

    function Thread() {
    }

    /*
    Optional arguments:

        * limit — Number of entries that should be included in the response. Default is 25.
        * start — Starting point for the query. Default is 0.
        * filter — Type of entries that should be returned (new, spam or killed).
        * exclude — Type of entries that should be excluded from the response (new, spam or killed).
    */
    
    // doesn't work?
    Thread.prototype.getThreadPosts = function () {
        apiGet(arguments,
			"get_thread_posts",
            { user_api_key: settings.user_key, thread_id: this.id },
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

    /* Post class */

    function Post() {
    }

	/** @scope disqus */
    return {
        userKeyUrl: "http://disqus.com/api/get_my_key/",

        setLogger: function (logFn) {
            settings.logger = logFn;
            return this;
        },
        
        setUserKey: function (user_key) {
            settings.user_key = user_key;
            return this;
        },
              
        /* Global API methods */

        getUserName: function () {
            apiPost(arguments,
				"get_user_name",
                { user_api_key: settings.user_key });
            return this;
        },
        
        getForumList: function () {
			apiGet(arguments,
				"get_forum_list",
				{ user_api_key: settings.user_key },
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
                { user_api_key: settings.user_key,
					thread_ids: threadIds.toString() });
            return this;
        }
    };
})();
