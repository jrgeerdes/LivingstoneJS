/******************************************************************************

osm_webgl.js is a Javascript library designed to take data from Open Street Maps
and display them in WebGL rather like the new Google Maps UI. For simplicity,
we're aiming to make functionality and naming schemes largely consistent with
the Google Maps API, except where it makes sense to do something better. We're
also aiming to run it through Google's Closure Compiler so we can optimize and
minimize the code.

******************************************************************************/

(function(){
    function Map(el, opt_options){
        el = this.container = (typeof(el) == 'string') ? document.getElementById(el) : el;
        opt_options = this.options = (typeof(opt_options) == 'object') ? opt_options : {};
        remove_kids(el);
/*        var map_canvas = this.map_canvas = create_element('canvas', null, {
            'class' : 'osm_webgl-container',
            'width' : opt_options['canvas_x_resolution'] || 640,
            'height' : opt_options['canvas_y_resolution'] || 480
        }, {
            'width' : el.offsetWidth,
            'height' : el.offsetHeight,
        });
        el.appendChild(map_canvas);
        
        var gl = this.gl = Map.prototype.initialize_webgl();
        if(gl){
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        }
*/
    }
    exp('Map', Map);
    Map.prototype.initialize_webgl = function(){
        var map_canvas = arguments[0] || this.map_canvas,
        gl = null;
        try{
            gl = map_canvas.getContext('webgl') || map_canvas.getContext('experimental-webgl');
        } catch(e) {
        }
        if(!gl){ // TODO: Figure out what to do if WebGL is not an option.
        }
        return gl;
    }
    
    
    function MapType(opt_options){
    }
    
    
    function Marker(opt_options){
    }
    exp('Marker', Marker);
    
    
    function InfoWindow(opt_options){
    }
    exp('InfoWindow', InfoWindow);
    
    
    function LatLngBounds(southwest, northeast){
    }
    exp('LatLngBounds', LatLngBounds);
    
    
    // Utility functions
    
    function create_element(tagName, children, attribs, style){
        var el = document.createElement(tagName);
        for(var i=0; children && i < children.length; i++){
            el.appendChild(children[i]);
        }
        if(attribs){
            var event_regular_expression = /^on/;
            for(var i in attribs){
                if(i.match(event_regular_expression)){
                    add_dom_event(
                        i.replace(event_regular_expression, ''),
                        attribs[i],
                        el
                    );
                } else {
                    el.setAttribute(i, attribs[i]);
                }
            }
        }
        if(style){
            for(var i in style){
                el.style[i] = style[i];
            }
        }
        return el;
    }
    
    
    function add_dom_event(type, listener, target, use_capture){
        target = target ? target : window;
        target.addEventListener(type, listener, use_capture); // I'm not screwing around with anything but W3C right now.
        return {
            type : type,
            listener : listener,
            target : target,
            use_capture : use_capture
        };
    }
    exp('addDOMListener', add_dom_event);
    
    function remove_dom_event(event_obj){
        event_obj.target.removeEventListener(
            event_obj.type,
            event_obj.listener,
            event_obj.use_capture
        );
    }
    exp('removeDOMistener', remove_dom_event);
    
    
    function remove_kids(el){
        while(el && el.firstChild){
            el.removeChild(el.firstChild)
        }
    }
    
    
    function exp(public_name, method){
        if(!window['_osm']){
            window['_osm'] = {}
        }
        window['_osm'][public_name] = method;
    }
})()