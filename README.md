Polyfilling querySelectorLive
=============================

This project is an efficient live querySelectorAll (aka querySelectorLive) prollyfill. 

I use different update schedules (mouse events, dom mutations, ...) depending on the selector to be sure not to waste the browser resources.

Usage is very simple:

	myQuerySelectorLive("h2~p", {
		onadded: function(e) {
			console.log("h2~p added:");
			console.log(e.textContent);
		},
		onremoved: function(e) {
			console.log("h2~p removed:");
			console.log(e.textContent);
		}
	});
	
	myQuerySelectorLive("ul.active,li:hover",{
		onadded: function(e) {
			console.log("ul/li added:");
			console.log(e.textContent);
		},
		onremoved: function(e) {
			console.log("ul/li removed:");
			console.log(e.textContent);
		}
	});

Please don't hesiste to create issues or make pull requests implementing further optimizations.
