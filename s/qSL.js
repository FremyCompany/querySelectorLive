//////////////////////////////////////////////////
////         prerequirements of qSL           ////
//////////////////////////////////////////////////
////                                          ////
//// note we require querySelectorAll to work ////
//// see github.com/termi/CSS_selector_engine ////
//// for a polyfill for older browsers        ////
////                                          ////
//////////////////////////////////////////////////

// global todos:
// - wrap this into a module
// - look for a few optimizations ideas in gecko/webkit

///
/// event stream implementation
/// please note this is required to 'live update' the qSA requests
///
function myEventStream(connect, disconnect, reconnect) {
	var self=this;
	
	// validate arguments
	if(!disconnect) disconnect=function(){};
	if(!reconnect) reconnect=connect;
	
	// high-level states
	var isConnected=false;
	var isDisconnected=false;
	var shouldDisconnect=false;
	
	// global variables
	var callback=null;
	var yieldEvent = function() {
		
		// call the function and pend disposal
		shouldDisconnect=true;
		try { callback && callback(self); } catch(ex) { setImmediate(function() { throw ex; }); }
		
		// if no action was taken, dispose
		if(shouldDisconnect) { dispose(); }
		
	}
	
	// export the interface
	var schedule = this.schedule = function(newCallback) {
		if(isDisconnected) { return; }
		callback=newCallback; shouldDisconnect=false;
		if(isConnected) {
			reconnect(yieldEvent);
		} else {
			connect(yieldEvent);
			isConnected=true;
		}
	}
	
	var dispose = this.dispose = function() {
		if(isConnected) {
			disconnect();
			self=null; yieldEvent=null; callback=null; isConnected=false; isDisconnected=true; shouldDisconnect=false;
		}
	}
}

///
/// call a function every timeout
///
function myTimeoutEventStream(options) {
	
	// flag that says whether the observer is still needed or not
	var rid = 0; var timeout=(typeof(options)=="number") ? (+options) : ("timeout" in options ? +options.timeout : 333);
	myEventStream.call(
		this, 
		function(yieldEvent) { rid = setTimeout(yieldEvent, timeout); },
		function() { clearTimeout(rid); }
	);
	
}

///
/// call a function every time the mouse move
///
function myMouseEventStream(options) {
		var self=this;

		// flag that says whether the event is still observered or not
		var scheduled = false; var interval=0;
		
		// handle the synchronous nature of mutation events
		var yieldEvent=null;
		var yieldEventDelayed = function() {
			if(scheduled) return;
			document.removeEventListener("DOMContentLoaded", yieldEventDelayed, false);
			document.removeEventListener("mousemove", yieldEventDelayed, true);
			document.removeEventListener("pointermove", yieldEventDelayed, true);
			scheduled = requestAnimationFrame(yieldEvent);
		}
		
		// start the event stream
		myEventStream.call(
			this, 
			function connect(newYieldEvent) {
				yieldEvent=newYieldEvent;
				document.addEventListener("DOMContentLoaded", yieldEventDelayed, false);
				document.addEventListener("mousemove", yieldEventDelayed, true);
				document.addEventListener("pointermove", yieldEventDelayed, true);
			},
			function disconnect() { 
				document.removeEventListener("DOMContentLoaded", yieldEventDelayed, false);
				document.removeEventListener("mousemove", yieldEventDelayed, true);
				document.removeEventListener("pointermove", yieldEventDelayed, true);
				cancelAnimationFrame(scheduled); yieldEventDelayed=null; yieldEvent=null; scheduled=false;
			},
			function reconnect(newYieldEvent) { 
				yieldEvent=newYieldEvent; scheduled=false;
				document.addEventListener("mousemove", yieldEventDelayed, true);
				document.addEventListener("pointermove", yieldEventDelayed, true);
			}
		);
		
	}

///
/// call a function every frame
///
function myAnimationFrameEventStream(options) {
	
	// flag that says whether the observer is still needed or not
	var rid = 0;
	myEventStream.call(
		this, 
		function(yieldEvent) { rid = requestAnimationFrame(yieldEvent); },
		function() { cancelAnimationFrame(rid); }
	);
	
}

///
/// call a function when the DOM is modified
///
var myDOMUpdateEventStream;
if("MutationObserver" in window) {
	myDOMUpdateEventStream = function myDOMUpdateEventStream(options) {
		 
		// configuration of the observer:
		if(options) {
			var target = "target" in options ? options.target : document.documentElement;
			var config = { 
				subtree: "subtree" in options ? !!options.subtree : true, 
				attributes: "attributes" in options ? !!options.attributes : true, 
				childList: "childList" in options ? !!options.childList : true, 
				characterData: "characterData" in options ? !!options.characterData : false
			};
		} else {
			var target = document.documentElement;
			var config = { 
				subtree: true, 
				attributes: true, 
				childList: true, 
				characterData: false
			};
		}
							
		// start the event stream
		var observer = null;
		myEventStream.call(
			this, 
			function(yieldEvent) { if(config) { observer=new MutationObserver(yieldEvent); observer.observe(target,config); target=null; config=null; } },
			function() { observer && observer.disconnect(); observer=null; yieldEvent=null; yieldEventWrapper=null; },
			function() { observer.takeRecords(); }
		);

	}
} else if("MutationEvent" in window) {
	myDOMUpdateEventStream = function myDOMUpdateEventStream(options) {
		var self=this;

		// flag that says whether the event is still observered or not
		var scheduled = false;
		
		// handle the synchronous nature of mutation events
		var yieldEvent=null;
		var yieldEventDelayed = function() {
			if(scheduled) return;
			document.removeEventListener("DOMContentLoaded", yieldEventDelayed, false);
			document.removeEventListener("DOMSubtreeModified", yieldEventDelayed, false);
			scheduled = requestAnimationFrame(yieldEvent);
		}
		
		// start the event stream
		myEventStream.call(
			this, 
			function connect(newYieldEvent) {
				yieldEvent=newYieldEvent;
				document.addEventListener("DOMContentLoaded", yieldEventDelayed, false);
				document.addEventListener("DOMSubtreeModified", yieldEventDelayed, false);
			},
			function disconnect() { 
				document.removeEventListener("DOMContentLoaded", yieldEventDelayed, false);
				document.removeEventListener("DOMSubtreeModified", yieldEventDelayed, false);
				cancelAnimationFrame(scheduled); yieldEventDelayed=null; yieldEvent=null; scheduled=false;
			},
			function reconnect(newYieldEvent) { 
				yieldEvent=newYieldEvent; scheduled=false;
				document.addEventListener("DOMSubtreeModified", yieldEventDelayed, false);
			}
		);
		
	}
} else {
	myDOMUpdateEventStream = myAnimationFrameEventStream;
}

///
/// composite event stream
/// because sometimes you need more than one event source
///
function myCompositeEventStream(stream1, stream2) {
	var self=this;
	
	// fields
	var yieldEvent=null; var s1=false, s2=false;
	var yieldEventWrapper=function(s) { 
		if(s1||s2) return;
		if(s==stream1) s1=true;
		if(s==stream2) s2=true;
		yieldEvent(self);
	}
	
	// start the event stream
	myEventStream.call(
		this, 
		function connect(newYieldEvent) {
			yieldEvent=newYieldEvent;
			stream1.schedule(yieldEventWrapper);
			stream2.schedule(yieldEventWrapper);
		},
		function disconnect() { 
			stream1.dispose();
			stream2.dispose();
		},
		function reconnect(newYieldEvent) { 
			yieldEvent=newYieldEvent; scheduled=false;
			s1 && stream1.schedule(yieldEventWrapper);
			s2 && stream2.schedule(yieldEventWrapper);
			s1 = s2 = false;
		}
	);
}


//////////////////////////////////////////////////
////          implementation of qSL           ////
//////////////////////////////////////////////////

///
/// the live querySelectorAll implementation
///
window.myQuerySelectorLive = function(selector, handler) {
	
	// TODO: make use of "mutatedAncestorElement" to update only elements inside the mutations
	
	var currentElms = [];
	var loop = function loop(eventStream) {
		
		// schedule next run
		eventStream.schedule(loop);
		
		// update elements matching the selector
		var newElms = [];
		var oldElms = currentElms.slice(0);
		var temps = document.querySelectorAll(selector);
		for(var i=newElms.length=temps.length; i;) { newElms.push(temps[--i]); }
		currentElms = newElms.slice(0); temps=null;
		
		// now pop and match until both lists are exhausted
		// (we use the fact the returned elements are in document order)
		var el1 = oldElms.pop();
		var el2 = newElms.pop();
		while(el1 || el2) {
			if(el1===el2) {
			
				// MATCH: pop both elements
				el1 = oldElms.pop();
				el2 = newElms.pop();
				
			} else if (el2 && /*el1 is after el2*/(!el1||(el2.compareDocumentPosition(el1) & (1|2|8|32))===0)) {
				
				// INSERT: raise onadded, pop new elements
				try { handler.onadded && handler.onadded(el2); } catch(ex) {}
				el2 = newElms.pop();
				
			} else {
			
				// DELETE: raise onadded, pop new elements
				try { handler.onremoved && handler.onremoved(el1); } catch(ex) {}
				el1 = oldElms.pop();
				
			}
		}
		
	};
	
	// use the event stream that best matches our needs
	var simpleSelector = selector.replace(/:(dir|lang|root|empty|blank|nth-child|nth-last-child|first-child|last-child|only-child|nth-of-type|nth-last-of-child|fist-of-type|last-of-type|only-of-type|not|matches|default)\b/gi,'')
	var eventStream; if(simpleSelector.indexOf(':') == -1) {
		
		// static stuff only
		eventStream = new myDOMUpdateEventStream(); 
		
	} else {
		
		// dynamic stuff too
		if(simpleSelector.replace(/:hover\b/gi,'').indexOf(':') == -1) {
			
			// mouse events only
			eventStream = new myCompositeEventStream(
				new myDOMUpdateEventStream(),
				new myMouseEventStream()
			);
			
		} else if((simpleSelector=simpleSelector.replace(/:(any-link|link|visited|local-link|target|active|focus|enabled|disabled|read-only|read-write|checked|indeterminate|valid|invalid|in-range|out-of-range|required|optional|user-error)\b/gi,'')).indexOf(':') == -1) {
			
			// slowly dynamic stuff only
			eventStream = new myCompositeEventStream(
				new myDOMUpdateEventStream(),
				new myTimeoutEventStream(250)
			);
			
		} else if(simpleSelector.replace(/:hover\b/gi,'').indexOf(':') == -1) {
			
			// both mouse and slowly dynamic stuff
			eventStream = new myCompositeEventStream(
				new myMouseEventStream(),
				new myCompositeEventStream(
					new myDOMUpdateEventStream(),
					new myTimeoutEventStream(250)
				)
			);
			
		} else {
			
			// other stuff, too
			eventStream = new myAnimationFrameEventStream();
			
		}
	}
	
	// start handling changes
	loop(eventStream);
	
}


//////////////////////////////////////////////////
//// here's some other stuff I may user later ////
//////////////////////////////////////////////////

///
/// get the common ancestor from a list of nodes
///
function getCommonAncestor(nodes) {

	// validate arguments
	if (!nodes || !nodes.length) { return null; }
	if (nodes.length < 2) { return nodes[0]; }

	// start bubbling from the first node
	var currentNode = nodes[0];
	
	// while we still have a candidate ancestor
	bubbling: while(currentNode && currentNode.nodeType!=9) {
		
		// walk all other intial nodes
		var i = nodes.length;    
		while (--i) {
			
			// if the curent node doesn't contain any of those nodes
			if (!currentNode.contains(nodes[i])) {
				
				// consider the parent node instead
				currentNode = currentNode.parentNode;
				continue bubbling;
				
			}
			
		}
		
		// if all were contained in the current node:
		// we found the solution
		return currentNode;
	}

	return null;
}

