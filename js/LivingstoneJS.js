/******************************************************************************

LivingstoneJS.js is a Javascript library designed to take data from Open Street Maps
and display them in WebGL rather like the new Google Maps UI. For simplicity,
we're aiming to make functionality and naming schemes largely consistent with
the Google Maps API, except where it makes sense to do something better. We're
also aiming to run it through Google's Closure Compiler so we can optimize and
minimize the code.

Copyright (C) 2014-2015  Jeremy R. Geerdes

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

******************************************************************************/


/*****

TODO:

- GeoJSON vector map type. Maybe even make that default
- Directions/routing support. Maybe even turn-by-turn directions?
- InfoWindow.prototype.draw needs to be reworked to more adequately account for possible CSS changes to iw layout.
- Support for fractal zooming, zoom animations

*****/


(function(){

    // CONSTANTS
    var radians_per_degree = Math.PI / 180,
    degrees_per_radian = 180 / Math.PI,
    earth_radius = 6378137;


    // Map is why we're here!
    function Map(el, opt_options){
        el = this.container = (typeof(el) == 'string') ? document.getElementById(el) : el;
        opt_options = this.options = (typeof(opt_options) == 'object') ? opt_options : {};
        remove_kids(el);

        var map_canvas = this.map_canvas = create_element('canvas', null, {
            'class' : 'LivingstoneJS-' + 'container',
            'width' : opt_options['canvas_x_resolution'] || el.offsetWidth,
            'height' : opt_options['canvas_y_resolution'] || el.offsetHeight
        }),
        attrib = this.attribution = create_element('div', null, {
            'class' : 'LivingstoneJS-' + 'attribution'
        });
        el.appendChild(
            this.inner_container = create_element(
                'div',
                [map_canvas, attrib], {
                    'class' : 'LivingstoneJS-' + 'style'
                }, {
                    'position' : 'relative',
                    'overflow' : 'hidden',
                    'height' : '100%',
                    'width' : '100%'
//                    'cursor' : 'move'
                }
            )
        );
        
        // initialize obj events
        this['listeners'] = {
            'click' : [],
            'dblclick' : [],
            'map_loaded' : [],
            'map_type_changed' : [],
            'viewport_changed' : [],
            'zoom_changed' : [],
            'map_render' : [],
            'overlay_added' : [],
            'overlay_removed' : [],
            'drag_start' : [],
            'drag_end' : [],
            'mousemove' : [],
            'drag' : [],
            'resize' : [],
            'touch_start' : [],
            'touch_end' : [],
            'mousewheel' : []
        };


        this.resize(); // set the height and width of the canvas, initialize the resize listener
        
        // initialize the controls
        // we use timeouts here to make them asynchronous, simulate multithreading. Hopefully, this will improve performance?
        if(!opt_options['no_zoom_control']){
            setTimeout(
                create_method_closure(this, function(){new ZoomControl({'map':this})}),
                0
            );
        }
        
        this.init_env();
        
        // process some key options
        if(opt_options['map_type']){
            this['setMapType'](opt_options['map_type']);
        }
        if(opt_options['viewport']){
            this['setViewport'](opt_options['viewport']);
        }

        
        // load listener
        map_events.process_event.apply(this, ['map_loaded']);

//        if(this.map_loaded_listener){
//            this.map_loaded_listener();
//        }
    }
    make_public('Map', Map); // export to the public namespace
    Map.prototype.init_env = function(){
        var map_canvas = arguments[0] || this.map_canvas,
        context = null,
        opt_options = this.options;
        if(map_canvas && map_canvas.getContext){
            if(0){ // comment out this line to enable webgl
//            if(!opt_options['disable_webgl']){ // if we're dealing with webGL and can do 3d stuff
                this.use_webgl = 1;
                context = map_canvas.getContext('webgl');
                if(!context){
                    context = map_canvas.getContext('experimental-webgl');
                }
            }
            if(!context){ // if webgl is unavailable, let's bounce to 2d canvas stuff
                this.use_webgl = 0;
                context = map_canvas.getContext('2d');
//                context.fillStyle = this.options['background_color'] || 'rgba(100, 100, 100, 1)';
//                context.fillRect(0, 0, map_canvas.width, map_canvas.height);
            }
        }
        this.context = context;
        
        // set up the event listeners
        var mousedown_listener = create_method_closure(this, Map.prototype.start_drag),
        mouseup_listener = create_method_closure(this, Map.prototype.end_drag),
        touchstart_listener = create_method_closure(this, Map.prototype.start_touch);
        touchend_listener = create_method_closure(this, Map.prototype.end_touch),
        mousewheel_listener = create_method_closure(this, Map.prototype.mousewheel);
        add_dom_event('mousedown', mousedown_listener, map_canvas);
        add_dom_event('touchstart', touchstart_listener, map_canvas);
        add_dom_event('mouseup', mouseup_listener); // we attach the mouseup to the window, in case someone drags off the map and releases there
        add_dom_event('touchend', touchend_listener, window);
        add_dom_event('touchleave', mouseup_listener, map_canvas);
        add_dom_event('touchcancel', mouseup_listener, window);
        add_dom_event('click', create_method_closure(this, Map.prototype.click), map_canvas);
        add_dom_event('dblclick', create_method_closure(this, Map.prototype.dblclick), map_canvas);
        add_dom_event('mousemove', create_method_closure(this, Map.prototype.mousemove), map_canvas);
        add_dom_event('mousewheel', mousewheel_listener, map_canvas);
        add_dom_event('DOMMouseScroll', mousewheel_listener, map_canvas);
    };
    Map.prototype['setMapType'] = function(map_type){
        var attrib = this.attribution;
        while(attrib.firstChild){
            attrib.removeChild(attrib.firstChild);
        }

        if(Array.isArray(map_type)){
            this.map_types = [];
            for(var i=0; i<map_type.length; i++){
                var mt = map_type[i];
                this.map_types.push(mt);
                mt.options['attribution'] && attrib.appendChild(mt.options['attribution'].cloneNode(1));
            }
        } else {
//                this.map_types = [new map_type(this)]
            this.map_types = [map_type]
            map_type.options['attribution'] && attrib.appendChild(map_type.options['attribution'].cloneNode(1));
        }
        
        
        this.render();
        map_events.process_event.apply(this, ['map_type_change']);
//        if(this.map_type_change_listener){
//            this.map_type_change_listener();
//        }
    };
    Map.prototype['setViewport'] = function(new_viewport){
        var viewport = this.viewport = this.viewport || {},
        opt_options = this.options,
        max_zoom = opt_options['max_zoom'] || 19,
        min_zoom = opt_options['min_zoom'] || 0,
        canvas = this.map_canvas,
        original_zoom = viewport['zoom'],
        map_types = this.map_types,
        map_type = map_types[0];
        for(var i in new_viewport){
            if(i == 'zoom'){
                new_viewport[i] = Math.max(new_viewport[i], min_zoom);
                new_viewport[i] = Math.min(new_viewport[i], max_zoom);
            }
            viewport[i] = new_viewport[i];
        }
        
        if(new_viewport['bounds']){
            this['fitBounds'](new_viewport['bounds']);
        } else {
            var centerPt = map_type['fromLatLngToPoint'](viewport['center'], this['getZoom']()),
            half_width = canvas.width / 2,
            half_height = canvas.height / 2,
            sw = map_type['fromPointToLatLng'](new Point(centerPt['x'] - half_width, centerPt['y'] - half_height), this['getZoom']()),
            ne = map_type['fromPointToLatLng'](new Point(centerPt['x'] + half_width, centerPt['y'] + half_height), this['getZoom']());
            
            viewport['bounds'] = new LatLngBounds(sw, ne);
        }
                
        this.render();
        map_events.process_event.apply(this, ['viewport_changed']);
        if(original_zoom != viewport['zoom']){ // if the zoom level changed, let's fire the more specific zoom changed event
            map_events.process_event.apply(this, ['zoom_changed']);
        }
//        if(this.viewport_change_listener){
//            this.viewport_change_listener();
//        }
    };
    Map.prototype['getViewport'] = function(){
        return this.viewport;
    };
    Map.prototype['fitBounds'] = function(bounds){
        var canvas = this.map_canvas,
        opt_options = this.options,
        map_type = this.map_types[0],
        canvas_height = canvas.height,
        canvas_width = canvas.width;
        
        for(var i=map_type.options['max_zoom']; i > map_type.options['min_zoom']; i--){
            var ne = map_type['fromLatLngToPoint'](bounds['ne'], i),
            sw = map_type['fromLatLngToPoint'](bounds['sw'], i),
            bounds_height = Math.abs(ne['y'] - sw['y']),
            bounds_width = Math.abs(ne['x'] - sw['x']);
            
            if(i - 1 <= map_type.options['min_zoom'] || (bounds_height <= canvas_height && bounds_width <= canvas_width)){
                this['setViewport']({
                    'center' : bounds['getCenter'](),
                    'zoom' : i
                });
                break;
            }
        }
    };
    Map.prototype.get_center_as_pt = function(){
        var canvas = this.map_canvas,
        center_pt = new Point(
            Math.round(canvas.width / 2) + this.offsetLeft,
            Math.round(canvas.height / 2) + this.offsetTop
        );
        return center_pt;
    };
    Map.prototype.render = function(){
        // so, the theory is that we set up the render call in a timeout so that it is running in a parallel thread.
        // it also allows us to cancel the render if another is called.
        var c = this.render_closure = this.render_closure || create_method_closure(this, Map.prototype.actually_render);
        if(this.render_timeout){
            clearTimeout(this.render_timeout);
        }
        this.render_timeout = setTimeout(c, 1);
    };
    
    Map.prototype.actually_render = function(){
        clearTimeout(this.render_timeout);
        this.render_timeout = undefined;
        
        // calculate the offset of the top-left corner of the map
        var offsetLeft = 0,
        offsetTop = 0,
        map_type = this.map_types && this.map_types[0] ? this.map_types[0] : null,
        viewport = this.viewport,
        map_canvas = this.map_canvas,
        context = this.context;
        
        if(context){
//            context.fillStyle = this.options['background_color'] || 'rgba(100, 100, 100, 1)';
//            context.fillRect(0, 0, map_canvas.width, map_canvas.height);
            context.clearRect(0, 0, map_canvas.width, map_canvas.height);
        }
        
        if(viewport && map_type){
            if(viewport['center'] && typeof(viewport['zoom']) == 'number'){ // if we have a center and zoom
                var center_point = viewport['center'] instanceof Point ? viewport['center'] : map_type['fromLatLngToPoint'](viewport['center'], this['getZoom']());
                offsetLeft = this.offsetLeft = (center_point['x'] - Math.round(map_canvas.width / 2));
                offsetTop = this.offsetTop = (center_point['y'] - Math.round(map_canvas.height / 2));
            } else if(viewport['bounds']){ // if we have LatLngBounds
                this['fitBounds'](viewport['bounds']);
            }
                    
            // render overlays, markers, and infowindows
            var overlays = [
                this.overlays,
                this.markers,
                this.infowindows
            ];
            for(var i = 0; i < overlays.length; i++){
                if(this.render_timeout){ // if a new render_timeout has been set
                    return; // we'll just jump out.
                }
                var olays = overlays[i];
                for(var j = 0; olays && j < olays.length; j++){
                    var overlay = olays[j];
                    overlay.draw_();
                }
            }


            // render the tiles
            // we render the layers backwards (i.e., from last to first) because we're drawing them all with composite destination-over
            for(var i=this.map_types.length - 1; i>=0; i--){
                if(this.render_timeout){ // if a new render_timeout has been set
                    return; // we'll just jump out.
                }
                var map_type = this.map_types[i],
                tileWidth = map_type.options['width'] || 256,
                tileHeight = map_type.options['height'] || 256,
                x = Math.floor(offsetLeft / tileWidth); // this line needs to be corrected to allow for spanning backward past 0
                while(x * tileWidth < map_canvas.width + offsetLeft){
                    var y = Math.floor(offsetTop / tileHeight); // this line needs to be corrected to allow for spanning backward past 0
                    while(y * tileHeight < offsetTop + map_canvas.height){
                        map_type.placeTile(x, y, (this.viewport['zoom'] || 0), this);
                        y++;
                    }
                    x++;
                }
            }
        

            map_events.process_event.apply(this, ['map_render']);
//            if(this.map_render_listener){
//                this.map_render_listener();
//            }
        }
    };
    Map.prototype['getZoom'] = function(){
        return this.viewport ? this.viewport['zoom'] : undefined;
    };
    Map.prototype['zoomOut'] = function(){
        var desired_zoom = this.viewport['zoom'] - 1,
        map_types = this.getMapType();
        for(var i=0; i<map_types.length; i++){
            var map_type = map_types[i],
            min_zoom = map_type.options['min_zoom'];
            desired_zoom = Math.max(typeof(min_zoom) == 'number' ? min_zoom : 0, desired_zoom);
        }
        this['setViewport']({
            'zoom' : desired_zoom
        });
    };
    Map.prototype['zoomIn'] = function(){
        var desired_zoom = this.viewport['zoom'] + 1,
        map_types = this.getMapType();
        for(var i=0; i<map_types.length; i++){
            var map_type = map_types[i],
            max_zoom = map_type.options['max_zoom'];
            desired_zoom = Math.min(typeof(max_zoom) == 'number' ? max_zoom : 19, desired_zoom);
        }
        this['setViewport']({
            'zoom' : desired_zoom
        });
    };
    Map.prototype['getOffset'] = function(){
        return new Point(this.offsetLeft, this.offsetTop);
    };
    Map.prototype.addOverlay = function(overlay, dont_render){
        this.removeOverlay(overlay, 1);
        var overlays;
        // if this is a marker, we want to make sure it is drawn after lines, polygons, etc.
        if(overlay instanceof Marker){
            overlays = this.markers = this.markers || [];
        } else if(overlay instanceof InfoWindow){ // if this is an infowindow, we'll treat it special.
            overlays = this.infowindows = this.infowindows || [];
        } else {
            overlays = this.overlays = this.overlays || [];
        }
        overlays.push(overlay);
        if(!dont_render){
            this.render();
        }
        
        map_events.process_event.apply(this, ['overlay_added']);
//        if(this.overlay_added_listener){
//            this.overlay_added_listener();
//        }
    };
    Map.prototype.removeOverlay = function(overlay, dont_render){
        var overlays;
        if(overlay instanceof Marker){
            overlays = this.markers = this.markers || [];
        } else if(overlay instanceof InfoWindow){ // if this is an infowindow, we'll treat it special.
            overlays = this.infowindows = this.infowindows || [];
        } else {
            overlays = this.overlays = this.overlays || [];
        }
        for(var i=0; overlays && i < overlays.length; i++){
            var test_overlay = overlays[i];
            if(test_overlay === overlay){
                overlays.splice(i, 1);
            }
        }
        if(!dont_render){
            this.render();
        }
        
        map_events.process_event.apply(this, ['overlay_removed']);
//        if(this.overlay_removed_listener){
//            this.overlay_removed_listener();
//        }
    };
    Map.prototype.start_drag = function(e){
        this.start_click_time = (new Date).getTime();
        var handler = create_method_closure(this, Map.prototype.drag, [{
            e : e,
            center : this.get_center_as_pt()
        }]);
        
        this.moved = 0;

        // add mouse drag listeners
        this.mouse_drag_listener = add_dom_event('mousemove', handler, window);
//        this.touch_drag_listener = add_dom_event('touchmove', handler, window);

        // set the cursor
        this.inner_container.style.cursor = 'move';

        // call the user-defined drag start listener
        map_events.process_event.apply(this, ['drag_start', e]);
//        if(this.drag_start_listener){
//            this.drag_start_listener();
//        }
    };
    Map.prototype.end_drag = function(e){
//        console.log("Ending drag.");
        if(this.mouse_drag_listener){
            remove_dom_event(this.mouse_drag_listener);
            this.mouse_drag_listener = undefined;
            this.moved && map_events.process_event.apply(this, ['drag_end', e]);
        }
//        remove_dom_event(this.touch_drag_listener);

        // reset the cursor
        this.inner_container.style.cursor = '';
        
        // call the user-defined drag end listener
//        if(this.drag_end_listener){
//            this.drag_end_listener();
//        }
    };
    Map.prototype.click = Map.prototype.mousemove = function(e){
        var re = /click$/,
        coords = new Point(e.clientX, e.clientY);

        // calculate canvas coords of the click so we can see if we're in a control or overlay
        // notice that we're going to hand off the event obj to the various controls and overlays
        // and if that control/overlay sets cancelBubble, we're going to kick out.
        
        el = e.target;
        while(el){
            coords['x'] += el.offsetLeft;
            coords['y'] += el.offsetTop;
            el = el.offsetParent;
        }

        // now, we refigure for map coords...
        coords['x'] += this.offsetLeft;
        coords['y'] += this.offsetTop;
        var latlng = this.map_types[0]['fromPointToLatLng'](coords, this['getZoom']()),  // we need lat/lng coords to check overlays quickly and easily
        overlays = [
            this.overlays,
            this.markers,
            this.infowindows
        ];
         
        // next, we route the event to the right listeners
        if(e.type.match(re)){ // click listener
            // call the user-defined click listener
            var elapsed_time = (new Date).getTime() - this.start_click_time;
            elapsed_time < 100 && e.target === this.map_canvas && map_events.process_event.apply(this, ['click', latlng, e]);
//            if(this.click_listener){
//                this.click_listener(e);
//            }
        } else { // mousemove listener
            map_events.process_event.apply(this, ['mousemove', latlng, e]);
//            if(this.mousemove_listener){
//                this.mousemove_listener(e);
//            }
        }
        
        for(var i=0; !e.cancelBubble && i<overlays.length; i++){
            var olays = overlays[i];
            for(var j=0; olays && !e.cancelBubble && j < olays.length; j++){
                var overlay = olays[j],
                arg = {
                    'e' : e,
                    'latlng' : latlng
                };

                if(overlay['check_for_mouseover'] && overlay['check_for_mouseover'](arg)){
                    if(e.type.match(re)){ // click listener
                        // call a click listener if any
                        overlay.click && overlay.click(arg);
                    } else { // mousemove listener
                        // call a mousemove listener if any
                        overlay.mousemove && overlay.mousemove(e);
                    }
                }
            }
        }
        
    };
    
    Map.prototype.dblclick = function(e, zoom_out){
        this.scroll_timeout = undefined;
        var x = e.pageX + this.offsetLeft,
        y = e.pageY + this.offsetTop,
        target = e.target,
        curr_center = this.map_types[0]['fromLatLngToPoint'](this.viewport['center'], this['getZoom']()),
        map_type = this.map_types[0],
        new_center = this.viewport['center'],
        zoom = this.viewport['zoom'];
        
        while(target){
            x += target.offsetLeft;
            y += target.offsetTop;
            target = target.offsetParent;
        }
        
        if(zoom_out && this.viewport['zoom'] > map_type.options['min_zoom']){
            new_center = map_type['fromPointToLatLng'](new Point(
                curr_center['x'] - (x - curr_center['x']),
                curr_center['y'] - (y - curr_center['y'])
            ), zoom);
            zoom--;
        } else if (this.viewport['zoom'] < map_type.options['max_zoom']){
            new_center = map_type['fromPointToLatLng'](new Point(
                curr_center['x'] + ((x - curr_center['x']) / 2),
                curr_center['y'] + ((y - curr_center['y']) / 2)
            ), zoom);
            zoom++;
        }
        this['setViewport']({
            'center' : new_center,
            'zoom' : zoom
        });

        // process the dblclick event
        map_events.process_event.apply(this, [(e.type == 'wheel' ? 'mousewheel' : 'dblclick'), e]);
        
    };
    
    // start_touch method is designed to detect touchstart events and set up the touchmove listeners needed to respond to them.
    Map.prototype.start_touch = function(e){
        //kill any touch listener already activated 
        this.touch_listener && remove_dom_event(this.touch_listener);
        
        if(e.touches.length == 2){ // if we're dealing with a two-finger touch, we listen for pinching movements
            var handler = create_method_closure(this, Map.prototype.pinch, [{
                e : e
            }]);
            this.touch_listener = add_dom_event('touchmove', handler, window);
        } else { // otherwise, we'll listen for a drag
            var handler = create_method_closure(this, Map.prototype.drag, [{
                e : e,
                center : this.get_center_as_pt()
            }]);
            this.touch_listener = add_dom_event('touchmove', handler, window);
        }

        // fire any user-defined touch_start events
        map_events.process_event.apply(this, ['touch_start', e]);
    };
    
    // end_touch is intended to kill the touch_listener
    Map.prototype.end_touch = function(e){
        this.touch_listener && remove_dom_event(this.touch_listener);
        
        // fire any user-defined touch_end events
        map_events.process_event.apply(this, ['touch_end', e]);
    };
    
    // pinch is intended to detect pinching movements
    Map.prototype.pinch = function(anchor, e){
        var start_time = anchor.start_time = anchor.start_time || (new Date).getTime(),
        now = (new Date).getTime(),
        orig_distance = Math.sqrt(Math.pow(anchor.e.touches[0].pageX - anchor.e.touches[1].pageX, 2) + Math.pow(anchor.e.touches[0].pageY - anchor.e.touches[1].pageY, 2)),
        now_distance = Math.sqrt(Math.pow(e.touches[0].pageX - e.touches[1].pageX, 2) + Math.pow(e.touches[0].pageY - e.touches[1].pageY, 2));
        
        if(now - start_time <= 500 && // if less than a half second
            Math.abs(now_distance - orig_distance) >= 150){ // and more than 150px difference in distance between the original pinch and this one, then
            
            // calculate the center of the pinch
            var x = (anchor.e.touches[0].pageX + anchor.e.touches[1].pageX) / 2 + this.offsetLeft,
            y = (anchor.e.touches[0].pageY + anchor.e.touches[1].pageY) / 2 + this.offsetTop,
            el = this.map_canvas,
            map_type = this.map_types[0],
            curr_center = map_type['fromLatLngToPoint'](this.viewport['center'], this['getZoom']()),
            new_center;
            while(el){
                x -= el.offsetLeft;
                y -= el.offsetTop;
                el = el.offsetParent;
            }
                        
            if(orig_distance > now_distance){ // if the pinch is inward
                new_center = map_type['fromPointToLatLng'](new Point(
                    curr_center['x'] - (x - curr_center['x']),
                    curr_center['y'] - (y - curr_center['y'])
                ), this['getZoom']());
                this['setViewport']({
                    'center' : new_center,
                    'zoom' : Math.max(this.getMapType()[0].options['min_zoom'], this.viewport['zoom'] - 1)
                });
//                this['zoomOut']();
            } else {
                new_center = map_type['fromPointToLatLng'](new Point(
                    curr_center['x'] + ((x - curr_center['x']) / 2),
                    curr_center['y'] + ((y - curr_center['y']) / 2)
                ), this['getZoom']());
                this['setViewport']({
                    'center' : new_center,
                    'zoom' : Math.min(this.getMapType()[0].options['max_zoom'], this.viewport['zoom'] + 1)
                });
//                this['zoomIn']();
            }
            this.end_touch();
        }
    };
    
    Map.prototype.mousewheel = function(e){
        var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
        
        if(!this.scroll_timeout){
            this.scroll_timeout = setTimeout(create_method_closure(this, Map.prototype.dblclick, [e, delta < 0]), 500);
        }
    };
    
    Map.prototype.drag = function(anchor, e){
// this seems to work in Android browser, Chrome mobile. But it doesn't seem to work on iOS Safari
        var anchor_e = anchor.e.touches ? anchor.e.touches[0] : anchor.e,
        x_moved = anchor_e.clientX - (e.changedTouches ? e.changedTouches[0] : e).clientX,
        y_moved = anchor_e.clientY - (e.changedTouches ? e.changedTouches[0] : e).clientY,
        new_center_pt = new Point(
            anchor.center['x'] + x_moved,
            anchor.center['y'] + y_moved
        );
        
        this.moved = x_moved || y_moved;

        this['setViewport']({
            'center' : this.map_types[0]['fromPointToLatLng'](new_center_pt, this['getZoom']())
        });


        // for debugging, we'll include a utility to display the mouse coords in the upper-left corner of the map
        if(0){
            var canvas = this.map_canvas,
            context = this.context,
            anchor_coords = anchor_e.clientX + ', ' + anchor_e.clientY
            coords = (e.changedTouches ? e.changedTouches[0] : e).clientX + ', ' + (e.changedTouches ? e.changedTouches[0] : e).clientY,
            width = Math.round(Math.max(context.measureText(coords).width, context.measureText(anchor_coords).width));
            context.fillStyle = 'rgba(100,200,100, .5)';
            context.fillRect(canvas.width - width - 4, 0, width + 4, 40);
            context.fillStyle = 'rgba(255,255,255, 1)';
            context.fillText(anchor_coords, canvas.width - width - 2, 16);
            context.fillText(coords, canvas.width - width - 2, 36);
//            console.log(e);
        }
        

        map_events.process_event.apply(this, ['drag', {
            'e' : e,
            'anchor' : anchor
        }]);
//        if(this.drag_listener){
//            this.drag_listener({
//                'e' : e,
//                'anchor' : anchor
//            });
//        }

        // kill the event so the screen doesn't jump around on touch devices
        if(e.preventDefault){
            e.preventDefault();
        }
        return false;
    };
    Map.prototype.resize = function(e){
        var resize_timer = this.resize_timer;
        if(resize_timer){
            clearTimeout(resize_timer);
        }
        var container = this.container,
        canvas = this.map_canvas,
        new_height = container.offsetHeight,
        new_width = container.offsetWidth;
        if(new_height != canvas.height || new_width != canvas.width){
            canvas.height = new_height;
            canvas.width = new_width;
            this.render();
        }
        
        // if we have a user-defined resize listener
        map_events.process_event.apply(this, ['resize', e]);
//        if(this.resize_listener){
//            this.resize_listener();
//        }

        var resize_closure = this.resize_closure = this.resize_closure || create_method_closure(this, Map.prototype.resize);
        this.resize_timer = setTimeout(resize_closure, 500);
    };
    Map.prototype['getMapType'] = function(){
        return this.map_types;
    };
    Map.prototype['getCanvas'] = function(){
        return this.map_canvas;
    };
    Map.prototype['getContext'] = function(){
        return this.context;
    };


    
    
    
    
    function Point(x, y, z){
        this['x'] = x;
        this['y'] = y;
        this['z'] = z;
    }
    make_public('Point', Point);
    
    
    
    
    function MapType(opt_options){
        var attribution = create_element('a', null, {
            'class' : 'LivingstoneJS-' + 'attribution',
            'href' : 'http://www.openstreetmap.org/copyright'
        });
        attribution.innerHTML = '&copy; OpenStreetMap contributors';
        this.options = { // defaults
            'max_zoom' : 19,
            'min_zoom' : 0,
            'attribution' : attribution,
            'earth_radius' : earth_radius
        };
        this['setOptions'](opt_options);
        
        if(this.options['attribution'] && !this.options['attribution'].nodeType){
            this.options['attribution'] = document.createTextNode(this.options['attribution']);
        }
    }
    MapType.prototype['setOptions'] = function(opt_options){
        for(var i in opt_options){
            this.options[i] = opt_options[i];
        }
    };
    MapType.prototype['fromLatLngToPoint'] = function(pt, z){
        var lat = pt['lat'],
        lng = pt['lng'],
        pi = Math.PI,
        zoom = typeof(z) == 'number' ? z : 0,
//        zoom = typeof(z) == 'number' ? z : this.map['getZoom'](),
        e = Math.sin(lat * pi / 180);
        e = Math.max(e, -.9999);
        e = Math.min(e, .9999);

        var y = Math.round((256 * (Math.pow(2, zoom - 1))) + (.5 * Math.log((1 + e) / (1 - e)) * ((-256 * Math.pow(2, zoom)) / (2 * Math.PI)))),
        x = Math.round((256 * Math.pow(2, zoom - 1)) + (lng * ((256 * Math.pow(2, zoom)) / 360)));
        
        return new Point(x, y);
    };
    MapType.prototype['fromPointToLatLng'] = function(pt, z){
        var x = pt['x'],
        y = pt['y'],
        tileHeight = this.options['tileHeight'] || 256,
        tileWidth = this.options['tileWidth'] || 256,
        zoom = typeof(z) == 'number' ? z : 0,
//        zoom = this.map['getZoom'](),
        pi = Math.PI,
        lng = (x - (256 * Math.pow(2, zoom - 1))) / (256 * Math.pow(2, zoom) / 360), // ((x-(256*(2^zoom-1)))/((256*(2^zoom))/360)
        e = (y - (256 * Math.pow(2, zoom - 1))) / (-256 * (Math.pow(2, zoom)) / (2 * pi)),
        lat = ((2 * Math.atan(Math.exp(e))) - (pi / 2)) / (pi / 180);
        
        lat = Math.max(lat, -90);
        lat = Math.min(lat, 90);

        while(lng < -180){
            lng += 360;
        }
        while(lng > 180){
            lng -= 360;
        }
/*
        if(lng < -180 || lng > 180){
            lng = lng % 360;
        }
*/        
        return new LatLng(lat, lng);
    };
    MapType.prototype['resolveTileUrl'] = function(x, y, zoom){
        if(this.options['resolveTileUrl']){
            return this.options['resolveTileUrl'](x, y, zoom);
        }else{ // default is going to be the OSM base map
            var server = (['a', 'b'])[Math.round(Math.random())];
            return 'http://' + server + '.tile.openstreetmap.org/' + zoom + '/' + x + '/' + y + '.png';
        }
    };
    MapType.prototype.generateTile = function(x, y, zoom, map){
        var tiles = this.tiles = this.tiles || {};
        if(!tiles[zoom]){
            tiles[zoom] = {};
        }
        if(!tiles[zoom][x]){
            tiles[zoom][x] = {};
        }
        
        var img = tiles[zoom][x][y] = new Image;
        img.onload = create_method_closure(this, function(x, y, zoom){
            this.tiles[zoom][x][y].LivingstoneJS_ready = 1; // let's assign a property to verify that the tile is loaded
            map.render();
//            this.placeTile(x, y, zoom);
        }, [x, y, zoom]);
        img.src = this['resolveTileUrl'](x, y, zoom);
        
        tiles[zoom][x][y] = img;
    };
    MapType.prototype.placeTile = function(x, y, zoom, map){
//        console && console.log && console.log(([x, y, zoom]).join(' | ')); // debugging only
        var tiles = this.tiles = this.tiles || {},
        total_tiles = this.total_tiles = Math.pow(2, zoom),
        tileX = x % total_tiles, // the actual x coord of tile we're going to draw
        tileY = y % total_tiles, // the actual y coord of tile we're going to draw
//        map = this.map,
        opt_options = this.options,
        tileWidth = this.tile_width = this.tile_width || (opt_options['tileWidth'] || 256),
        tileHeight = this.tile_height = this.tile_height || (opt_options['tileHeight'] || 256);
        
//        tileX = tileX % total_tiles;
//        while(tileX < 0){
//            tileX = total_tiles + tileX;
//        }

//        var img = tiles[zoom] && tiles[zoom][tileX % total_tiles]? tiles[zoom][tileX % total_tiles][tileY] : undefined,
        var img = tiles[zoom] && tiles[zoom][tileX]? tiles[zoom][tileX][tileY] : undefined,
        imgX = (x * tileWidth) - map.offsetLeft,
        imgY = (y * tileHeight) - map.offsetTop,
        context = map.context;
        
//        if(tileY >= 0 && tileY < total_tiles){
        context.save();
        context.globalCompositeOperation = 'destination-over';
        if(y >= 0 && y < total_tiles && (!opt_options['no_infinite_scroll'] || x >= 0 && x < total_tiles)){
            if(!img){
                this.generateTile(tileX, tileY, zoom, map);
            } else if(img.LivingstoneJS_ready){
                if(imgX > -tileWidth && imgY > -tileHeight){
                    context.drawImage(img, imgX, imgY); // this should be updated to allow for scaling, fractional zooming/animations.
                }
            } else {
                context.fillStyle = map.options['background_color'] || 'rgba(100, 100, 100, 1)';
                context.fillRect(imgX, imgY, tileWidth, tileHeight);                
            }
        } else {
            context.fillStyle = map.options['background_color'] || 'rgba(100, 100, 100, 1)';
            context.fillRect(imgX, imgY, tileWidth, tileHeight);
        }
        context.restore();
    };
    make_public('MapType', MapType);
    
    MapType['STREET_MAP'] = new MapType
    
    MapType['TERRAIN_OVERLAY'] = new MapType({
        'max_zoom' : 19,
        'min_zoom' : 0,
        'resolveTileUrl' : function(x, y, zoom){
            return 'http://c.tiles.wmflabs.org/hillshading/' + zoom + '/' + x + '/' + y + '.png';
        }
    });
    
    var STAMEN_ATTRIBUTION = create_element('span', [
        document.createTextNode('Map tiles by '),
        create_element('a', [document.createTextNode('Stamen Design')],{'href':'http://stamen.com'}),
        document.createTextNode(', under '),
        create_element('a', [document.createTextNode('CC BY 3.0')],{'href':'http://creativecommons.org/licenses/by/3.0'}),
        document.createTextNode('. Data by '),
        create_element('a', [document.createTextNode('OpenStreetMap')],{'href':'http://openstreetmap.org'}),
        document.createTextNode('under'),
        create_element('a', [document.createTextNode('CC BY SA')],{'href':'http://creativecommons.org/licenses/by-sa/3.0'})
    ]);
    
    MapType['TERRAIN'] = new MapType({
        'max_zoom' : 18,
        'min_zoom' : 4,
        'attribution' : STAMEN_ATTRIBUTION.cloneNode(1),
        'resolveTileUrl' : function(x, y, zoom){
            return 'http://c.tile.stamen.com/terrain/' + zoom + '/' + x + '/' + y + '.jpg';
        }
    });
    
    MapType['WATERCOLOR'] = new MapType({
        'max_zoom' : 19,
        'min_zoom' : 4,
        'attribution' : STAMEN_ATTRIBUTION.cloneNode(1),
        'resolveTileUrl' : function(x, y, zoom){
            return 'http://c.tile.stamen.com/watercolor/' + zoom + '/' + x + '/' + y + '.jpg';
        }
    });
    
    MapType['SATELLITE'] = new MapType({
        'max_zoom' : 18,
        'min_zoom' : 0,
        'resolveTileUrl' : function(x, y, zoom){
            var server = Math.round(Math.random() * 4 + .5);
            return 'http://otile' + server + '.mqcdn.com/tiles/1.0.0/sat/' + zoom + '/' + x + '/' + y + '.jpg';
        }
    });

    make_public('RasterMapType', MapType);
    
    
    
    function VectorMapType(map, opt_options){
    }
    extend_class(VectorMapType, MapType);
    VectorMapType.prototype.generateTile = function(x, y, zoom, map){
        var tiles = this.tiles = this.tiles || {};
        if(!tiles[zoom]){
            tiles[zoom] = {};
        }
        if(!tiles[zoom][x]){
            tiles[zoom][x] = {};
        }
        
        var img = tiles[zoom][x][y] = eval;
        img.onload = create_method_closure(this, function(x, y, zoom){
            this.tiles[zoom][x][y].LivingstoneJS_ready = 1; // let's assign a property to verify that the tile is loaded
            map.render();
//            this.placeTile(x, y, zoom);
        }, [x, y, zoom]);
        img.src = this['resolveTileUrl'](x, y, zoom);
        
        tiles[zoom][x][y] = img;
    };
    
    VectorMapType.prototype.placeTile = function(x, y, zoom, map){
        var tiles = this.tiles = this.tiles || {},
        tile = tiles[zoom] && tiles[zoom][x] ? tiles[zoom][x][y] : undefined
    }



/************************************

Overlays

************************************/




    function Overlay(opt_options){
    }
        
    // draw_ method loops through the map, calling the overlay's own draw method to
    // tile it appropriately. It hands the position of the overlay's origin as a Point
    Overlay.prototype.draw_ = function(){
        if(this.options['map']){
            var opt_options = this.options,
            map = opt_options['map'],
            context = map.context,
            map_type = map.map_types[0],
            canvas = map.map_canvas,
            bounds = this['bounds'],
            shape = this.shape,
            pos = opt_options['position'] instanceof Array ? opt_options['position'][0] : opt_options['position'] ? opt_options['position'] : bounds['getCenter'](),
            position = pos ? map_type['fromLatLngToPoint'](
                pos,
                map['getZoom']()
            ) : undefined;
            
            if(!position){
                return;
            }
            
            position['x'] -= Math.round(canvas.width / (map_type.total_tiles * map_type.tile_width)) * map_type.total_tiles * map_type.tile_width;
            
            if((bounds && bounds['overlaps'](map.viewport['bounds'])) || (position['x'] - map.offsetLeft < canvas.width)){
                var sw;
                if(bounds){
                    sw = map_type['fromLatLngToPoint'](bounds['sw'], map['getZoom']());
                    sw['x'] -= Math.round(canvas.width / (map_type.total_tiles * map_type.tile_width)) * map_type.total_tiles * map_type.tile_width;
                }
                while(position['x'] - map.offsetLeft < canvas.width || (bounds && sw['x'] - map.offsetLeft < canvas.width)){
                    this['draw'](position);

                    // increment the position
                    position['x'] += map_type.total_tiles * map_type.tile_width;
                    if(bounds){
                        sw['x'] += map_type.total_tiles * map_type.tile_width;
                    }
                }
            } else {
                this.hide && this.hide();
            }
        }
    };

/*
    Overlay.prototype.draw_ = function(){
        if(this.options['map']){ // if we don't have a map, there's no point
            var opt_options = this.options,
            map = opt_options['map'],
            context = map.context,
            map_type = map.map_types[0],
            canvas = map.map_canvas,
            position = map_type['fromLatLngToPoint'](opt_options['position'] instanceof Array ? opt_options['position'][0] : opt_options['position']);
            position['x'] -= Math.round(canvas.width / (map_type.total_tiles * map_type.tile_width)) * map_type.total_tiles * map_type.tile_width;

            // if we're in the displayable area, let's render the overlay.
            // TODO: This logic probably needs to be worked on to ensure best performance. Namely, make sure the overlay is actually within the bounds of the viewport
            if(position['x'] - map.offsetLeft < canvas.width){
                while(position['x'] - map.offsetLeft < canvas.width){

                    this['draw'](position);

                    // increment the position
                    position['x'] += map_type.total_tiles * map_type.tile_width;
                }
            } else {
                this.hide && this.hide();
            }
        }
    };
*/
    Overlay.prototype.click = function(e){
        var opt_options = this.options,
        infowindows = this.infowindows
        
        // if we have an infowindow
        for(var i=0; infowindows && i<infowindows.length; i++){
            infowindows[i].open();
        }
        
        // if we have a user-defined click listener
        map_events.process_event.apply(this, ['click', e]);
//        if(this.click_listener){
//            this.click_listener(e);
//        }
        
        e.cancelBubble;
        return false;
    };
    Overlay.prototype['setOptions'] = function(opt_options){
        this.options = this.options || {}; // default options
        
        if(opt_options){
            // if a map option is provided, and we've already got one, let's remove the marker from the original
            if(typeof(opt_options['map']) != 'undefined' && this.options['map'] && this.options['map'] !== opt_options['map']){
                this.options['map'].removeOverlay(this);
            }
            for(var i in opt_options){
                if(i == 'map' && opt_options[i] !== this.options['map']){
                    if(this.options['map'] && this.options['map'].removeOverlay){
                        this.options['map'].removeOverlay(this);
                    }
                    if(opt_options['map'] && opt_options['map'].addOverlay){
                        opt_options['map'].addOverlay(this);
                    }
                }
                this.options[i] = opt_options[i];
            }
            var map = this.options['map'];
            if(map){
                map.addOverlay(this, 1);
//                this.draw_();
                map.render();
            }
        }
    };
    make_public('Overlay', Overlay);
    
    
    
    
    function Marker(opt_options){
        this['setOptions'](opt_options);
        this['listeners'] = {
            'click' : [],
            'mouseover' : [],
            'mouseout' : []
        };
    }
    extend_class(Marker, Overlay);
    Marker.prototype['draw'] = function(position){
        if(this.options['map']){
            var opt_options = this.options,
            map = opt_options['map'],
            context = map.context,
            map_type = map.map_types[0],
            canvas = map.map_canvas;
            
            if(typeof(opt_options['icon']) == 'string'){ // if we have a custom icon url given, we'll need to get it and draw it in the correct place
                var img = this.img && this.img.src == opt_options['icon'] ? this.img : undefined;
                if(img){ // if we already have the image
                    var anchor = opt_options['anchor'] = opt_options['anchor'] || new Point( // get the provided anchor or calculate it at the bottom center of the image
                        Math.round(img.width / 2),
                        img.height
                    ),
                    imgX = position['x'] - anchor['x'] - map.offsetLeft,
                    imgY = position['y'] - anchor['y'] - map.offsetTop;
                    context.drawImage(img, imgX, imgY);
                    if(!opt_options['shape']){ // if we don't have a custom shape defined, we'll assume that the anchor is in the bottom-center of the image and build a shape accordingly
                        opt_options['shape'] = [
                            new Point(-anchor['x'], anchor['y']), // upper-left
                            new Point(-anchor['x'], 0), // lower-left
                            new Point(anchor['x'], 0), // lower-right
                            new Point(anchor['x'], anchor['y']), // upper-right
                            new Point(-anchor['x'], anchor['y']) // upper-left
                        ];
                    }
                } else {
                    img = this.img = new Image;
                    img.onload = create_method_closure(this, Marker.prototype.draw_);
                    img.src = opt_options['icon']
                }
            } else if(typeof(opt_options['icon']) == 'function'){ // if we have a custom icon draw method given, we'll call it and hand off everything it will need to do its job
                context.save();
                opt_options['icon'].apply(this, [position]); // we assume you can access the map through the opt_options you provided, so you should be able to get the other stuff from it, too.
                context.restore();
            } else { // if we're drawing a standard marker
                var pole_width = 6,
                pole_half = Math.round(pole_width / 2),
                pole_height = 30,
                startingPos = new Point(position['x'] - pole_half - map.offsetLeft, position['y'] - pole_height - map.offsetTop),
                anchorPos = new Point(position['x'] - map.offsetLeft, position['y'] - map.offsetTop),
                flag_height = pole_height * .75,
                txt_width = opt_options['label'] ? context.measureText(opt_options['label']).width : 0,
                flag_width = Math.max(32, txt_width + 10),
                flag_x = startingPos['x'] + pole_half + 1,
                flag_perspective_difference = Math.round(pole_half * .75);
                context.lineWidth = 1;
                if(opt_options['label_font']){
                    context.font = opt_options['label_font'] || '14px Arial';
                }

                // draw the flag
                context.fillStyle = opt_options['color'] || 'rgba(255, 75, 75, 1)';
                context.strokeStyle = opt_options['flag_stroke_color'] || 'rgba(100, 25, 25, 1)';
                context.beginPath();
                context.moveTo(startingPos['x'] + pole_width, startingPos['y']);
                context.lineTo(startingPos['x'] + pole_width + flag_width, startingPos['y']);
                context.lineTo(startingPos['x'] + pole_width + flag_width - flag_perspective_difference, startingPos['y'] + flag_height);
                context.lineTo(startingPos['x'] + pole_width - flag_perspective_difference, startingPos['y'] + flag_height);
                context.fill();
                context.stroke();

                // draw the flagpole
                for(var i=0; i < pole_width; i++){
                    var rgb_val = 175 - (50 * Math.max(i - pole_half, 0));
                    context.beginPath();
                    context.moveTo(startingPos['x'] + i, startingPos['y']);
                    context.lineTo(anchorPos['x'], anchorPos['y']);
                    context.strokeStyle = 'rgba(' + rgb_val + ', ' + rgb_val + ', ' + rgb_val + ', 1)';
                    context.stroke();
                }
                
                // draw the cap of the flagpole
                context.beginPath();
                context.moveTo(startingPos['x'], startingPos['y']);
                context.bezierCurveTo(startingPos['x'], startingPos['y'] - 2, startingPos['x'] + pole_width, startingPos['y'] - 2, startingPos['x'] + pole_width, startingPos['y']);
                context.bezierCurveTo(startingPos['x'] + pole_width, startingPos['y'] + 2, startingPos['x'], startingPos['y'] + 2, startingPos['x'], startingPos['y']);
                context.fillStyle = 'rgba(175, 175, 175, 1)';
                context.fill();
                
                // draw the label, if any
                if(opt_options['label']){
                    var txt_x = Math.round((flag_width - txt_width) / 2) - Math.round(flag_perspective_difference * .75),
                    txt_height = this.txt_height;
                    if(typeof(txt_height) == 'undefined'){
                        var txt_height_el = create_element('div', [document.createTextNode(opt_options['label'])], null, {
                            'font' : opt_options['label_font'] || '14px Arial',
                            'position' : 'absolute',
                            'visibility' : 'hidden'
                        });
                        document.body.appendChild(txt_height_el);
                        txt_height = this.txt_height = txt_height_el.offsetHeight;
                        document.body.removeChild(txt_height_el);
                    }
                    context.fillStyle = opt_options['label_color'] || '#000';
                    context.fillText(
                        opt_options['label'],
                        startingPos['x'] + pole_width + txt_x,
                        startingPos['y'] + flag_height - Math.round((flag_height - (txt_height * .66)) / 2)
                    );
                }
                
                if(!opt_options['shape']){
                    // establish the mouseover zone
                    var flag_bottom = -(flag_height - pole_height);
                    opt_options['shape'] = [
                        new Point(0, 0), // anchor
                        new Point(-pole_half, -pole_height), // top-left corner of flagpole
                        new Point(pole_half + flag_width, -pole_height), // top-right corner of flag
                        new Point(pole_half + flag_width - flag_perspective_difference, flag_bottom), // bottom-right corner of flag
                        new Point(pole_half - flag_perspective_difference, flag_bottom), // bottom-left corner of flag
                        new Point(0, 0) // anchor
                    ];
                }
            }
        }
    };

/*
    Marker.prototype.draw = function(){
        if(this.options['map']){
            var opt_options = this.options,
            map = opt_options['map'],
            context = map.context,
            map_type = map.map_types[0],
            canvas = map.map_canvas,
            position = map_type['fromLatLngToPoint'](opt_options['position']);
            position['x'] -= Math.round(canvas.width / (map_type.total_tiles * map_type.tile_width)) * map_type.total_tiles * map_type.tile_width;
//            while(position['x'] < canvas.width - map.offsetLeft){
            while(position['x'] - map.offsetLeft < canvas.width){
                if(opt_options['icon']){ // if we have an icon given, we'll need to get it and draw it in the correct place
                    var img = this.img
                    if(img){ // if we have the image already
                        var anchor = opt_options['anchor'] = opt_options['anchor'] || new Point( // get the anchoring point, which is relative to the upper-left corner of the marker. If we don't have one, we'll anchor it the center of the bottom of the image
                            Math.round(img.width / 2),
                            img.height
                        ),
                        imgX = position['x'] - anchor['x'] - map.offsetLeft,
                        imgY = position['y'] - anchor['y'] - map.offsetTop;
                        context.drawImage(img, imgX, imgY);
                    } else {
                        img = this.img = new Image;
                        img.src = opt_options['icon'];
                        img.onload = create_method_closure(this, Marker.prototype.draw);
                    }
                } else if(opt_options['draw']){ // if the user provided a custom draw function (i.e., to draw the marker using canvas methods), let's call it
                    opt_options['draw']({
                        'context' : context,
                        'offsetLeft' : map.offsetLeft,
                        'offsetTop' : map.offsetTop
                    });
                } else { // if we're drawing a standard marker, let's do it.
                    var startingPos = new Point(position['x'] - 3 - map.offsetLeft, position['y'] - 30 - map.offsetTop),
                    anchorPos = new Point(position['x'] - map.offsetLeft, position['y'] - map.offsetTop),
                    pole_width = 6,
                    pole_half = Math.round(pole_width / 2),
                    flag_height = 24,
                    txt_width = opt_options['label'] ? context.measureText(opt_options['label']).width : 0,
                    flag_width = Math.max(32, txt_width + 10),
                    flag_x = startingPos['x'] + pole_half + 1,
                    flag_perspective_difference = Math.round(pole_half * .75);
                    context.lineWidth = 1;
                    if(opt_options['label_font']){
                        context.font = opt_options['label_font'] || '14px Arial';
                    }

                    // draw the flag
                    context.fillStyle = opt_options['color'] || 'rgba(255, 75, 75, 1)';
                    context.beginPath();
                    context.moveTo(startingPos['x'] + pole_width, startingPos['y']);
                    context.lineTo(startingPos['x'] + pole_width + flag_width, startingPos['y']);
                    context.lineTo(startingPos['x'] + pole_width + flag_width - flag_perspective_difference, startingPos['y'] + flag_height);
                    context.lineTo(startingPos['x'] + pole_width - flag_perspective_difference, startingPos['y'] + flag_height);
                    context.fill();

                    // draw the flagpole
                    for(var i=0; i < pole_width; i++){
                        var rgb_val = 175 - (50 * Math.max(i - pole_half, 0));
                        context.beginPath();
                        context.moveTo(startingPos['x'] + i, startingPos['y']);
                        context.lineTo(anchorPos['x'], anchorPos['y']);
                        context.strokeStyle = 'rgba(' + rgb_val + ', ' + rgb_val + ', ' + rgb_val + ', 1)';
                        context.stroke();
                    }
                
                    // draw the cap of the flagpole
                    context.beginPath();
                    context.moveTo(startingPos['x'], startingPos['y']);
                    context.bezierCurveTo(startingPos['x'], startingPos['y'] - 2, startingPos['x'] + pole_width, startingPos['y'] - 2, startingPos['x'] + pole_width, startingPos['y']);
                    context.bezierCurveTo(startingPos['x'] + pole_width, startingPos['y'] + 2, startingPos['x'], startingPos['y'] + 2, startingPos['x'], startingPos['y']);
                    context.fillStyle = 'rgba(175, 175, 175, 1)';
                    context.fill();
                
                    // draw the label, if any
                    if(opt_options['label']){
                        var txt_x = Math.round((flag_width - txt_width) / 2) - Math.round(flag_perspective_difference * .75),
                        txt_height = this.txt_height;
                        if(typeof(txt_height) == 'undefined'){
                            var txt_height_el = create_element('div', [document.createTextNode(opt_options['label'])], null, {
                                'font' : opt_options['label_font'] || '14px Arial',
                                'position' : 'absolute',
                                'visibility' : 'hidden'
                            });
                            document.body.appendChild(txt_height_el);
                            txt_height = this.txt_height = txt_height_el.offsetHeight;
                            document.body.removeChild(txt_height_el);
                        }
                        context.fillStyle = opt_options['label_color'] || '#000';
                        context.fillText(
                            opt_options['label'],
                            startingPos['x'] + pole_width + txt_x,
                            startingPos['y'] + flag_height - Math.round((flag_height - (txt_height * .66)) / 2)
                        );
                    }
                }
                
                // increment the position
                position['x'] += map_type.total_tiles * map_type.tile_width;
            }
        }
    };
*/

    Marker.prototype['setOptions'] = function(opt_options){
        Overlay.prototype['setOptions'].apply(this, [opt_options]);
        if(opt_options){
            this.txt_height = undefined;
        }
    };
    
    Marker.prototype['check_for_mouseover'] = function(arg){
        var opt_options = this.options,
        map = opt_options['map'],
        map_type = map.map_types[0],
        anchor = map_type['fromLatLngToPoint'](opt_options['position'], map['getZoom']()),
        shape = opt_options['shape'] || [],
        mouse_pt = map_type['fromLatLngToPoint'](arg['latlng'], map['getZoom']()),
        inf = 1e600,
        eps = .0001,
        intersections = 0;
        
        for(var i=0; i<shape.length - 1; i++){
            var pt1 = new Point(anchor['x'] + shape[i]['x'], anchor['y'] + shape[i]['y']),
            pt2 = new Point(anchor['x'] + shape[i + 1]['x'], anchor['y'] + shape[i + 1]['y']);
                        
            if(pt1['y'] > pt2['y']){ // make sure we know which of these points is north.
                pt3 = pt2;
                pt2 = pt1;
                pt1 = pt3;
            }
            
            if(mouse_pt['y'] == pt1['y'] || mouse_pt['y'] == pt2['y']) mouse_pt['y'] += eps;
            
            if(mouse_pt['y'] < pt1['y'] || // the mouse y coord is outside the shape segment...
                mouse_pt['y'] > pt2['y'] ||
                mouse_pt['x'] > Math.max(pt1['x'], pt2['x'])){ // ...or mouse x coord is greater than the max x of the shape segment
                continue; // no intersection; move on
            }
            if(mouse_pt['x'] < Math.min(pt1['x'], pt2['x'])){ // if the mouse x coord is less than the min x of the shape segment
                intersections++; // we have an intersect
                continue; // move on
            }
            
            var multiplier_red = (pt1['x'] != pt2['x']) ? (pt2['y'] - pt1['y']) / (pt2['x'] - pt2['x']) : inf,
            multiplier_blue = (pt1['x'] != mouse_pt['x']) ? (mouse_pt['y'] - pt1['y']) / (mouse_pt['x'] - pt1['x']) : inf;
            
            if(multiplier_blue >= multiplier_red){
                intersections++;
            }
        }

        if(intersections % 2){
            map.inner_container.style.cursor = 'pointer';
            arg['e'].cancelBubble = 1;
            arg['e'].stopPropagation && arg['e'].stopPropagation();

            return 1;
        } else {
            map.inner_container.style.cursor = '';
        }
    };

/*
    Marker.prototype['check_for_mouseover'] = function(arg){
        var opt_options = this.options,
        map = opt_options['map'],
        map_type = map.map_types[0],
        anchor = map_type['fromLatLngToPoint'](opt_options['position']),
        shape = opt_options['shape'] || [],
        mouse_pt = map_type['fromLatLngToPoint'](arg['latlng']),
        min_x = 0,
        outside_point,
        intersections = 0;
        
        // step 1: calculate an outside point to serve as an endpoint of our ray casting.
        for(var i = 0; i < shape.length; i++){
            min_x = Math.min(shape[i]['x'], min_x);
        }
        outside_point = new Point(-10, -10);
        
        // step 2: cast the ray
        for(var i = 0; i < shape.length - 1; i++){
            if(pt2['x'] != pt1['x']){
                var multiplier = (pt2['y'] - pt1['y']) / (pt2['x'] - pt1['x']),
                offset = pt2['y'] - multiplier * pt2['x'],
                ideal_x = (mouse_pt['y'] - offset) / multiplier; // at what x coord does the line between shape points intersect the mouse y coord?
                if(ideal_x >= outside_point['x'] &&
                    ideal_x <= mouse_pt['x'] &&
                    mouse_pt['y'] >= Math.min(pt1['y'], pt2['y']) &&
                    mouse_pt['y'] <= Math.max(pt1['y'], pt2['y'])){
                    intersections++;
                }
            } else { // just in case we have a vertical line segment...?
                var multiplier = (pt2['x'] - pt1['x']) / (pt2['y'] - pt1['y']),
                offset = pt2['x'] - multiplier * pt2['y'],
                ideal_y = (mouse_pt['x'] - offset) / multiplier;
                if(ideal_y >= outside_point['y'] &&
                    ideal_y <= mouse_pt['y'] &&
                    mouse_pt['x'] >= Math.min(pt1['x'], pt2['x']) &&
                    mouse_pt['x'] <= Math.max(pt1['x'], pt2['x'])){
                    intersections++;
                }
            }
        }

        // step 3: if intersections is an odd number, we've got a winner
        if(intersections % 2){
            map.inner_container.style.cursor = 'pointer';
            arg['e'].cancelBubble = 1;
            arg['e'].stopPropagation && arg['e'].stopPropagation();

            return 1;
        } else {
            map.inner_container.style.cursor = '';
        }
        
    };
*/

    make_public('Marker', Marker);
    


    function Line(opt_options){
        this['setOptions'](opt_options);
        this['listeners'] = {
            'click' : [],
            'mouseover' : [],
            'mouseout' : []
        };

        if(!this.options['position']){
            this.options['position'] = [[]];
        }
        if(this.options['position'][0] instanceof LatLng){
            this.options['position'][0] = this.options['position'];
        }

        var bounds = this['bounds'] = new LatLngBounds,
        primary_form = this.options['position'][0];
        for(var i=0; primary_form && i<primary_form.length; i++){
            bounds.extend(primary_form[i]);
        }
//        console.log(bounds);
        
        if(this.options['map'] && this.options['position'] && this.options['position'].length > 0){ // if we have points, let's draw the line
            this.options['map'].render();
        }
    }
    extend_class(Line, Overlay);
    
    // TODO: A closed polyline is jagged where the two endpoints meet. This needs to be fixed.
    Line.prototype['draw'] = function(position){
        if(this.options['position'] && this.options['position'].length && this.options['map']){ // if we have points and a map...
            var opt_options = this.options,
            map = opt_options['map'],
            context = map.context,
            map_type = map.map_types[0],
            canvas = map.map_canvas,
            pt0 = map_type['fromLatLngToPoint'](this.options['position'][0], map['getZoom']());

            // set the line options
            context.save();
            context.lineWidth = opt_options['stroke_width'] || 4;
            context.strokeStyle = opt_options['stroke_color'] || 'rgb(0, 200, 0)';
            context.fillStyle = opt_options['fill_color'] || 'rgb(150, 200, 150)';
            context.lineJoin = opt_options['corner_style'] || 'miter';
            
            if(opt_options['position'][0] instanceof LatLng){
                opt_options['position'] = [
                    opt_options['position']
                ];
            }
            
            // loop through the points to draw the line
            for(var i=0; i < opt_options['position'].length; i++){
                var position = opt_options['position'][i];
                
                for(var j=0; j < position.length; j++){
                    var pt1 = map_type['fromLatLngToPoint'](position[j], map['getZoom']()),
                    x = pt1['x'] - map.offsetLeft,
                    y = pt1['y'] - map.offsetTop;
                    
                    if(j == 0){
                        context.beginPath();
                        context.moveTo(x, y);
                    } else {
                        context.lineTo(x, y);
                    }
                }
                
                if(this['isClosed']()){
                    context.closePath();
                }
            
                if(this instanceof Polygon && this['isClosed']()){ // if this is a polygon, we're going to fill the thing
                    if(i == 0){
                        context.globalCompositeOperation = 'source-over';
                        context.globalAlpha = opt_options['fill_opacity'] || 1;
                    } else {
                        context.globalCompositeOperation = 'destination-out';
                        context.globalAlpha = 1;
                    }
                    context.fill();
                }

                // stroke the line
                context.globalCompositeOperation = 'source-over';
                context.globalAlpha = opt_options['stroke_opacity'] || 1;
                context.stroke();
            }
            
            
            context.restore();
        }
    };
    
    Line.prototype['extend'] = function(){
        if(!this.options['position']){
            this.options['position'] = [];
        }
        var position = this.options['position'][0] = this.options['position'][0] || [],
        bounds = this['bounds'],
        map = this.options['map'];
        
        if(position instanceof LatLng){
            position = this.options['position'];
            this.options['position'] = [
                position
            ];
        }
        for(var i=0; i<arguments.length; i++){
            var latlng = arguments[i];
            if(this instanceof Polygon){
                if(position.length == 0){
                    position.push(latlng); // first point
                    position.push(new LatLng(latlng['lat'], latlng['lng'])); // last point
                } else {
                    position.splice(position.length - 1, 0, latlng)
                }
            } else {
                position.push(latlng);
            }
            bounds['extend'](latlng);
        }
//        console.log(position);
        map && map.render();
    };
    
    Line.prototype['getLength'] = function(){
        var position = this.options['position'],
        length = 0;
        for(var i=1; i < position.length; i++){
            var vertex_a = position[i - 1],
            vertex_b = position[i];
            length += vertex_a['distanceFrom'](vertex_b);
        }
        return length;
    };
    
    Line.prototype['setOptions'] = function(opt_options){
        Overlay.prototype['setOptions'].apply(this, [opt_options]);
        if(this.options['position'] && this.options['map']){
            this.options['map'].render();
        }
    };
    
    Line.prototype['isClosed'] = function(opt_options){
        var position = this.options['position'];
        if(position.length && position[0] instanceof Array && position[0][0]['equals'](position[0][position[0].length - 1])){
            return 1;
        }
//        return position && position.length > 1 && position[0]['lat'] == position[position.length - 1]['lat'] && position[0]['lng'] == position[position.length - 1]['lng'];
    };
    
    Line.prototype['check_for_mouseover'] = function(arg){
        return this.contains(arg['latlng']);
    };
    
    Line.prototype['contains'] = function(point){
        var opt_options = this.options,
        map = opt_options['map'],
        map_type = map.map_types[0],
        bounds = this['bounds'];
        if(bounds['sw'] && bounds['ne']){
            var mouse_pt = point instanceof LatLng ? map_type['fromLatLngToPoint'](point, map['getZoom']()) : point,
            threshold = (opt_options['stroke_width'] || 4) / 2,
            outside_point = new LatLng(point instanceof LatLng ? point['lat'] : (map_type['fromPointToLatLng'](point, map['getZoom']()))['lat'], bounds['sw']['lng'] - 1),
            intersections = 0;
            if(!this.options['position']){
                this.options['position'] = [[]];
            }
            
            for(var j=0; j<opt_options['position'].length; j++){
                var position = opt_options['position'][j];
                
                for(var i=0; i < position.length - 1; i++){
                    var pt1 = map_type['fromLatLngToPoint'](position[i], map['getZoom']()),
                    pt2 = map_type['fromLatLngToPoint'](position[i + 1], map['getZoom']()),
                    multiplier = (pt2['y'] - pt1['y']) / (pt2['x'] - pt1['x']),
                    offset = pt1['y'] - (multiplier * pt1['x']),
                    should_be_y = (multiplier * mouse_pt['x']) + offset,
                    x = (mouse_pt['y'] - offset) / multiplier;
                    
                    // check if we're over the line
                    if(mouse_pt['x'] >= (Math.min(pt1['x'], pt2['x']) - threshold) && // if the mouse is right of the left limit of the segment,
                        mouse_pt['x'] <= (Math.max(pt1['x'], pt2['x']) + threshold) && // left of the right limit of the segment, and
                        Math.abs(mouse_pt['y'] - should_be_y) <= threshold){ // within the threshold of where the line should be
                        return 1; // then we're moused over
                    }
                    
                    if(this instanceof Polygon && this['isClosed']()){ // if this is a Polygon
                        if(x > map_type['fromLatLngToPoint'](outside_point, map['getZoom']())['x'] &&
                            x <= mouse_pt['x'] &&
                            mouse_pt['y'] >= Math.min(pt1['y'], pt2['y']) &&
                            mouse_pt['y'] <= Math.max(pt1['y'], pt2['y'])){
                            intersections++;
                        }
                    }
                }
                
                if(this instanceof Polygon && intersections % 2){ // if we have an odd number of intersections, we must be inside the polygonprocess_touch
                    return 1;
                }
            }
        }
    };
    make_public('Line', Line);





    
    function Polygon(opt_options){
        this['setOptions'](opt_options);
        this['listeners'] = {
            'click' : [],
            'mouseover' : [],
            'mouseout' : []
        };
        if(!this.options['position']){
            this.options['position'] = [[]];
        }
        if(this.options['position'][0] instanceof LatLng){
            this.options['position'][0] = this.options['position'];
        }

        var bounds = this['bounds'] = new LatLngBounds,
        primary_form = this.options['position'][0];
        for(var i=0; primary_form && i<primary_form.length; i++){
            bounds.extend(primary_form[i]);
        }

        if(this.options['map'] && this.options['position'] && this.options['position'].length > 0){ // if we have points, let's draw the line
            this.options['map'].render();
        }
    }
    extend_class(Polygon, Line);
    Polygon.prototype['getArea'] = function(r){
        var opt_options = this.options,
        map = opt_options['map'],
        pos = opt_options['position'],
        x = 0,
        total_area = 0;
        if(!r && map && map.options['map_type'] && map['getMapType']()[0]){
            r = map['getMapType']()[0].options['earth_radius']; // default radius of earth
        }
        
        for(var k=0; k<pos.length; k++){
            var position = pos[k],
            latlng1 = position[0];
            for(var i=1; i<position.length - 1; i++){
                var a = 0,
                b = 0,
                f = 0,
                c = [latlng1, position[i], position[i + 1], latlng1],
                d = [],
                e = [];
                
                for(var j=0; j<3; j++){
                    var lat1 = c[j]['latRadians'](),
                    lat2 = c[j + 1]['latRadians'](),
                    lng1 = c[j]['lngRadians'](),
                    lng2 = c[j + 1]['lngRadians']();
                    d[j] = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat1 - lat2) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng1 - lng2) / 2), 2)));
                    f += d[j];
                    
                    var g = e[j] = [
                        Math.cos(lat1) * Math.cos(lng1),
                        Math.cos(lat1) * Math.sin(lng1),
                        Math.sin(lat1)
                    ];
                }
                
                f /= 2;
                c = Math.tan(f/2);
                for(j=0; j<3; j++){
                    c *= Math.tan((f - d[j]) / 2);
                }
                
                a = 4 * Math.atan(Math.sqrt(Math.abs(c)));
                b = 0 < e[0][0] * e[1][1] * e[2][2] + e[1][0] * e[2][1] * e[0][2] + e[2][0] * e[0][1] * e[1][2] - e[0][0] * e[1][2] - e[1][0] * e[0][1] * e[2][2] - e[2][0] * e[1][1] * e[0][2] ? 1 : -1;
                
                x += a * b;
            }
            if(k){
                total_area -= Math.abs(x * Math.pow(r, 2));
            } else {
                total_area += Math.abs(x * Math.pow(r, 2));
            }
        }
        return total_area;
    };
    
    make_public('Polygon', Polygon);
    

    
    
    
    function InfoWindow(opt_options){
        this['container'] = create_element(
            'div',[
                this.controlsContainer = create_element(
                    'div', [
                        create_element(
                            'div', [
                                document.createTextNode('x')
                            ], {
                                'class':'LivingstoneJS-' + 'infowindow-close',
                                'onclick' : create_method_closure(this, function(e){
                                    e.stopPropagation && e.stopPropagation();
                                    InfoWindow.prototype['close'].apply(this, []);
                                })
                            }
                        )
                    ], {
                        'class' : 'LivingstoneJS-' + 'infowindow-controls'
                    }
                ),
                this.contentContainer = create_element('div', null, {'class':'LivingstoneJS-' + 'infowindow-content'}), // content container
                this.leg = create_element('div', null, {'class':'LivingstoneJS-' + 'infowindow-base'}) // the leg which stems from the location on the map
            ],{
                'class' : 'LivingstoneJS-' + 'infowindow'
            }
        );
        this['setOptions'](opt_options);
    }
    extend_class(InfoWindow, Overlay);

    InfoWindow.prototype['draw'] = function(position){
        var containerStyle = this['container'].style,
        map = this.options['map'];

        // TODO: make these next two lines a bit less brittle, in case someone changes the way the leg looks
        containerStyle.left = (position['x'] - map.offsetLeft) + 'px'; 
        containerStyle.top = (position['y'] - this.height - map.offsetTop) + 'px';
    };

    InfoWindow.prototype['setOptions'] = function(opt_options){
        var options = this.options;
        if(typeof(options) == 'undefined'){ // if not defined, let's define it
            options = this.options = {};

            // define a getter/setter for the map property because it's going to require some gymnastics
            Object.defineProperty(options, 'map', {
                get : function(){
                    if(this['overlay'] && this['overlay'].options['map']){ // if the infowindow is attached to an overlay, we'll return the overlay's map
                        return this['overlay'].options['map'];
                    } else { // otherwise, we'll return the infowindow's overlay
                        return this.map_;
                    }
                },
                set : function(new_map){
                    if(this['overlay']){ // if the infowindow is attached to an overlay, we'll set the overlay's map
                        this['overlay'].options['map'] = new_map;
                    }
                    this.map_ = new_map; // set the infowindow's map
                }
            });

            // define a getter/setter for the position property because it's going to require some gymnastics, too
            Object.defineProperty(options, 'position', {
                get : function(){
                    if(this['overlay'] && this['overlay'].options['position']){ // if the infowindow is attached to an overlay with a specific position, we'll return the overlay's position
                        return this['overlay'].options['position'];
                    } else{ // otherwise, we'll return the infowindow's position
                        return this.position_;
                    }
                },
                set : function(new_position){
                    if(this['overlay']){ // if the infowindow is attached to an overlay, we'll set the overlay's position
                        this['overlay'].options['position'] = new_position;
                    }
                    this.position_ = new_position;
                }
            });
        }
        
        if(opt_options){
            // if we have a map already, and we're moving to a new map, remove this from the old one
            if(typeof(opt_options['map']) != 'undefined' && options['map'] && opt_options['map'] !== options['map']){
                options['map'].removeOverlay(this);
            }
            // if we're assigning the infowindow to an overlay...
            if(typeof(opt_options['overlay']) != 'undefined' && opt_options['overlay'] !== options['overlay']){
                // first, we remove the click listener from any old overlay assignment
                if(options['overlay']){
                    map_events['removeEvent'](this.overlay_click_listener);
                }
                
                // then, we add the click listener to a new overlay if applicable
                if(opt_options['overlay']){
                    this.overlay_click_listener = map_events['addEvent'](opt_options['overlay'], 'click', create_method_closure(this, InfoWindow.prototype['open']));
                }
            }
            for(var i in opt_options){
                options[i] = opt_options[i];
            }
            var map = this.options['map'];
            if(map){
                map.addOverlay(this, 1);
                this.draw_();
            }
        }
    };    
    
    InfoWindow.prototype['open'] = InfoWindow.prototype.show = function(opt_options){
        this['setOptions'](opt_options);
        var container = this['container'],
        options = this.options,
        map = this.options['map'];
        if(map){
            container.style.top = container.style.left = '0px';
            container.style.visibility = 'hidden';
            map.inner_container.appendChild(container);
            if(options['content']){
                this.contentContainer.appendChild(options['content']);
                container.style.width = this.contentContainer.offsetWidth + 'px';
            }
            this.height = container.offsetHeight;
            this.width = container.offsetWidth;
            map.addOverlay(this, 1);
            this.draw_();
            container.style.visibility = 'visible';
        }
    };
    
    InfoWindow.prototype['close'] = InfoWindow.prototype.hide = function(){
        var container = this['container'];
        container.parentNode && container.parentNode.removeChild(container);
        this.options['map'] && this.options['map'].removeOverlay(this);
    };
    
    InfoWindow.prototype['isOpen'] = function(){
        var container = this['container'];
        return container.parentNode ? 1 : undefined;
    };
    
    InfoWindow.prototype['check_for_mouseover'] = function(){
        return;
    };
    make_public('InfoWindow', InfoWindow);
    


    
    function LatLngBounds(){
        for(var i=0; i<arguments.length; i++){
            this['extend'](arguments[i]);
        }
    }
    LatLngBounds.prototype['extend'] = function(){
        for(var i=0; i<arguments.length; i++){
            var new_latlng = arguments[i];
            if(this['sw']){
                this['sw'] = new LatLng(
                    Math.min(this['sw']['lat'], new_latlng['lat']),
                    Math.min(this['sw']['lng'], new_latlng['lng'])
                );
            } else{
                this['sw'] = new_latlng;
            }
            if(this['ne']){
                this['ne'] = new LatLng(
                    Math.max(this['ne']['lat'], new_latlng['lat']),
                    Math.max(this['ne']['lng'], new_latlng['lng'])
                );
            } else {
                this['ne'] = new_latlng;
            }
        }
    };
    LatLngBounds.prototype['contains'] = function(latlng){
        var sw = this['sw'],
        ne = this['ne'];
        return sw && ne && latlng['lat'] >= sw['lat'] && latlng['lat'] <= ne['lat'] && latlng['lng'] >= sw['lng'] && latlng['lng'] <= ne['lng'];
    };
    LatLngBounds.prototype['overlaps'] = function(bounds){
        if(bounds['ne']['lat'] >= this['sw']['lat'] && // if ne lat of bounds is greater or equal to sw lat of this AND
            bounds['sw']['lat'] <= this['ne']['lat'] && // sw lat of bounds is less than or equal to ne lat of this AND
            bounds['ne']['lng'] >= this['sw']['lng'] && // ne lng of bounds is greater than or equal to sw lng of this AND
            bounds['sw']['lng'] <= this['ne']['lng'] // sw lng of bounds is less than or equal to ne lng of this
        ) {
            return 1; // then the bounds must overlap
        }
    };
    LatLngBounds.prototype['getCenter'] = function(){
        var sw = this['sw'],
        ne = this['ne'],
        center = new LatLng((sw['lat'] + ne['lat']) / 2, (sw['lng'] + ne['lng']) / 2);
        return center;
    };
    make_public('LatLngBounds', LatLngBounds);
    
    
    
    
    function LatLng(lat, lng){
        this['lat'] = lat;
        this['lng'] = lng;
    }
    
    LatLng.prototype['lat'] = function(){
        return this['lat'];
    };
    
    LatLng.prototype['lng'] = function(){
        return this['lng'];
    };
    
    LatLng.prototype['latRadians'] = function(){
        return this['lat'] * radians_per_degree;
    };
    
    LatLng.prototype['lngRadians'] = function(){
        return this['lng'] * radians_per_degree;
    };
    
    LatLng.prototype['distanceFrom'] = function(latlng, r){
        var lat1 = this['latRadians'](),
        lng1 = this['lngRadians'](),
        lat2 = this['latRadians'](),
        lng2 = this['lngRadians'](),
        d = Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos((latlng['lng'] - this['lng']) * radians_per_degree)) * (r || earth_radius);
        return d;
    };
    
    LatLng.prototype['equals'] = function(latlng){
        return latlng['lat'] == this['lat'] && latlng['lng'] == this['lng'];
    }
    
    make_public('LatLng', LatLng);




    function ZoomControl(opt_options){
        var options = this.options = opt_options || {},

        // build the control
        container = this.container = create_element(
            'div',[
                this.zoomInButton = create_element(
                    'div',[
                        document.createTextNode('+')
                    ], {
                        'class' : 'LivingstoneJS-' + 'zoomcontrol-in ' + 'LivingstoneJS-' + 'zoomcontrol-inactive',
                        'onclick' : create_method_closure(this, ZoomControl.prototype.zoomIn)
                    }
                ),
                this.zoomOutButton = create_element(
                    'div', [
                        document.createTextNode('-')
                    ], {
                        'class' : 'LivingstoneJS-' + 'zoomcontrol-out ' + 'LivingstoneJS-' + 'zoomcontrol-inactive',
                        'onclick' : create_method_closure(this, ZoomControl.prototype.zoomOut)
                    }
                )
            ],{
                'class' : 'LivingstoneJS-' + 'zoomcontrol'
            }
        );
        
        this.checkStatus();
        
        // append the control to the given container element or the map inner container
        (options['container'] || options['map'].inner_container).appendChild(container);
        
        map_events['addEvent'](this.options['map'], 'viewport_changed', create_method_closure(this, ZoomControl.prototype.checkStatus));
    }
    
    ZoomControl.prototype.zoomIn = function(e){
        e.stopPropagation && e.stopPropagation();
        e.stopImmediatePropagation && e.stopImmediatePropagation();
        var options = this.options;
        options['map'] && options['map']['zoomIn']();
//        this.checkStatus();
    };
    
    ZoomControl.prototype.zoomOut = function(e){
        e.stopPropagation && e.stopPropagation();
        e.stopImmediatePropagation && e.stopImmediatePropagation();
        var options = this.options;
        options['map'] && options['map']['zoomOut']();
//        this.checkStatus();
    };
    
    ZoomControl.prototype.checkStatus = function(){
        var map = this.options['map'],
        maptype = map['getMapType']()[0].options,
        re = /-(in)?active\b/;

        // zoom in button
        if(maptype['max_zoom'] <= map['getZoom']()){ // if we're on the high end of the zoom range, let's gray out the zoom in button
            this.zoomInButton.className = this.zoomInButton.className.replace(re, '-inactive');
        } else {
            this.zoomInButton.className = this.zoomInButton.className.replace(re, '-active');
        }
        
        // zoom out button
        if(maptype['min_zoom'] >= map['getZoom']()){ // if we're on the low end of the zoom range, let's gray out the zoom out button
            this.zoomOutButton.className = this.zoomOutButton.className.replace(re, '-inactive');
        } else {
            this.zoomOutButton.className = this.zoomOutButton.className.replace(re, '-active');
        }
    };
    


    function Geocoder(){
        var geocoders = Geocoder['geocoders'];
        this.index = geocoders.length;
        geocoders.push(this);
    }
    Geocoder.prototype['geocode'] = function(q, callback){
        var reverse_geocode = 0;
        if(q instanceof LatLng){
            q = {
                'lat' : q['lat'],
                'lon' : q['lng']
            }
            reverse_geocode = 1;
        } else if(typeof(q) != 'object'){
            q = {
                'q' : q
            }
        }
        q['format'] = 'json';
        q['json_callback'] = 'window._osm.Geocoder.geocoders[' + this.index + '].callback';
        
        var url = 'http://nominatim.openstreetmap.org/' + (reverse_geocode ? 'reverse' : 'search') + '?';
        for(var i in q){
            url += '&' + encodeURIComponent(i) + '=' + encodeURIComponent(q[i]);
        }
        
        var script = create_element('script', null, {
            'type' : 'text/javascript',
            'src' : url,
            'onload' : function(){this.parentNode.removeChild(this);}
        });
        
        document.getElementsByTagName('head')[0].appendChild(script);
        
        this.dev_callback = callback;
        
        this.timeout = setTimeout(create_method_closure(this, Geocoder.prototype['callback'], [{'error':Geocoder['status']['TIMED_OUT']}]), 2.5 * 1000);
    };
    Geocoder.prototype['callback'] = function(response){
        if(this.timeout){
            clearTimeout(this.timeout);
            this.timeout = undefined;
            
            var r = {};
            if(response instanceof Array && response[0]){
                response = response[0];
                r = {
                    'geometry' : {
                        'latlng' : new LatLng(parseFloat(response['lat']), parseFloat(response['lon'])),
                        'bounds' : new LatLngBounds(
                            new LatLng(parseFloat(response['boundingbox'][0]), parseFloat(response['boundingbox'][2])),
                            new LatLng(parseFloat(response['boundingbox'][1]), parseFloat(response['boundingbox'][3]))
                        )
                    },
                    'attribution' : response['licence'],
                    'type' : response['type']
                };
            } else{
                r = response;
                if(r['licence']){
                    r['attribution'] = r['licence'];
                    delete(r['licence']);
                }
            }
            this.dev_callback && this.dev_callback(r);
            this.dev_callback = undefined;
        }
        
    };
    Geocoder['status'] = {
        'TIMED_OUT' : 408
    };
    Geocoder['geocoders'] = [];
    
    make_public('Geocoder', Geocoder);


    
    // Map Event Handling
    var map_events = {};
    map_events['addEvent'] = function(obj, listener, method){ // as the name suggests, adds an event listener to an object
        if(obj['listeners'][listener]){
            obj['listeners'][listener].push(method);
        }
        return {
            obj : obj,
            listener : listener,
            method : method
        };
    };

    map_events['removeEvent'] = function(event_obj){ // as the name suggests, removes an event listener from an object
        var listeners = event_obj.obj['listeners'][event_obj.listener];
        for(var i=0; listeners && i < listeners.length; i++){
            var listener = listeners[i];
            if(listener === event_obj.method){
                listeners.splice(i, 1);
            }
        }
    };

    map_events['trigger'] = function(obj, listener, e){ // as the name suggests, triggers an event listener on an object
        map_events.process_event.apply(obj, [listener, e]);
    };

    // process_event is designed to process an array of event listeners, triggering all of the appropriate methods
    // it is designed to be run in the context of the triggering object
    map_events.process_event = function(){
        var listener = arguments[0],
        other_args = Array.prototype.slice.call(arguments, 1);
        for(var i=0; this['listeners'][listener] && i < this['listeners'][listener].length; i++){
            var l = this['listeners'][listener][i];
            l.apply(this, other_args);
        }
    };


    var add_dom_event = map_events['addDOMEvent'] = function(listener, method, target, use_capture){
        target = target ? target : window;
        target.addEventListener(listener, method, use_capture); // I'm not screwing around with anything but W3C right now.
        return {
            method : method,
            listener : listener,
            target : target,
            use_capture : use_capture
        };
    };
    
    var remove_dom_event = map_events['removeDOMEvent'] = function(event_obj){
        (event_obj.target || window).removeEventListener(
            event_obj.listener,
            event_obj.method,
            event_obj.use_capture
        );
    }


    
    make_public('events', map_events);




    // geometry utility functions
    var geometry = {},
    getAngle = geometry['getAngle'] = function(latlng1, latlng2, latlng3){ // calculates the angle formed by line segments intersecting at latlng2
        var angle = getBearing(latlng2, latlng1) - getBearing(latlng2, latlng3);
        while(angle < 0){
            angle += 360;
        }
        return angle;
    },
    getBearing = geometry['getBearing'] = function(latlng1, latlng2){ // calculates the bearing from latlng1 to latlng2
        bearing = -Math.atan2(Math.sin(latlng1['lngRadians']() - latlng2['lngRadians']()) * Math.cos(latlng2['latRadians']()),Math.cos(latlng1['latRadians']()) * Math.sin(latlng2['latRadians']()) - Math.sin(latlng1['latRadians']()) * Math.cos(latlng1['lngRadians']() - latlng2['lngRadians']()));
        while(bearing < 0){
            bearing += Math.PI * 2;
        }
        return bearing * degrees_per_radian;
    };
    
    make_public('geometry', geometry);

    
    // Utility functions
    function extend_class(child_class, parent_class){
        var intermediary_class = function(){};
        intermediary_class.prototype = parent_class.prototype;
        child_class.prototype = new intermediary_class;
    }
    make_public('extendClass', extend_class);
    
    
    
    
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
    
    
    
    
    function create_method_closure(context, method, args){
        return function(){
            var my_args = [];
            for(var i=0; args && i < args.length; i++){
                my_args.push(args[i]);
            }
            for(var i=0; i < arguments.length; i++){
                my_args.push(arguments[i]);
            }
            return method.apply(context, my_args);
        }
    }
    make_public('createMethodClosure', create_method_closure);
    
    

    
    
    
    function remove_kids(el){
        while(el && el.firstChild){
            el.removeChild(el.firstChild)
        }
    }
    
    
    
    function make_public(public_name, method){
        if(!window['_osm']){
            window['_osm'] = {}
        }
        window['_osm'][public_name] = method;
    }

    
})()