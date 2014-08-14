/******************************************************************************

osm_webgl.js is a Javascript library designed to take data from Open Street Maps
and display them in WebGL rather like the new Google Maps UI. For simplicity,
we're aiming to make functionality and naming schemes largely consistent with
the Google Maps API, except where it makes sense to do something better. We're
also aiming to run it through Google's Closure Compiler so we can optimize and
minimize the code.

******************************************************************************/

(function(){
    // Map is why we're here!
    function Map(el, opt_options){
        el = this.container = (typeof(el) == 'string') ? document.getElementById(el) : el;
        opt_options = this.options = (typeof(opt_options) == 'object') ? opt_options : {};
        remove_kids(el);

        var map_canvas = this.map_canvas = create_element('canvas', null, {
            'class' : 'osm_webgl-container',
            'width' : opt_options['canvas_x_resolution'] || el.offsetWidth,
            'height' : opt_options['canvas_y_resolution'] || el.offsetHeight
        }, {
            'width' : el.offsetWidth,
            'height' : el.offsetHeight,
        });
        el.appendChild(map_canvas);
        
        this.init_env();
        
        // process some key options
        if(opt_options['map_type']){
            this['setMapType'](opt_options['map_type']);
        }
        if(opt_options['viewport']){
            this['setViewport'](opt_options['viewport']);
        }
        
        // load listener
        if(this.map_loaded_listener){
            this.map_loaded_listener();
        }
    }
    make_public('Map', Map); // export to the public namespace
    Map.prototype.init_env = function(){
        var map_canvas = arguments[0] || this.map_canvas,
        context = null;
        if(map_canvas && map_canvas.getContext){
            context = map_canvas.getContext('webgl');
            if(!context){
                context = map_canvas.getContext('experimental-webgl');
            }
        }
        if(context){ // if we're dealing with webGL and can do 3d stuff
            this.use_webgl = 1;
        } else { // if webgl is unavailable, let's bounce to 2d canvas stuff
            this.use_webgl = 0;
            context = map_canvas.getContext('2d');
            context.fillStyle = 'rgba(100, 100, 100, 1)';
            context.fillRect(0, 0, map_canvas.width, map_canvas.height);
        }
        this.context = context;
        
        // set up the event listeners
        add_dom_event('mousedown', create_method_closure(this, Map.prototype.start_drag), map_canvas);
        add_dom_event('mouseup', create_method_closure(this, Map.prototype.end_drag)); // we attach the mouseup to the window, in case someone drags off the map and releases there
//        add_dom_event('click', create_method_closure(this, Map.prototype.click), map_canvas);
    };
    Map.prototype['setMapType'] = function(map_type){
        if(Array.isArray(map_type)){
            this.map_types = [];
            for(var i=0; i<map_type.length; i++){
                this.map_types.push(new map_type[i](this));
            }
        } else {
                this.map_types = [new map_type(this)]
        }
        this.render();
        if(this.map_type_change_listener){
            this.map_type_change_listener();
        }
    };
    Map.prototype['setViewport'] = function(new_viewport){
        var viewport = this.viewport = this.viewport || {},
        opt_options = this.options,
        max_zoom = opt_options['max_zoom'] || 19,
        min_zoom = opt_options['min_zoom'] || 0;
        for(var i in new_viewport){
            if(i == 'zoom'){
                new_viewport[i] = Math.max(new_viewport[i], min_zoom);
                new_viewport[i] = Math.min(new_viewport[i], max_zoom);
            }
            viewport[i] = new_viewport[i];
        }
        this.render();
        if(this.viewport_change_listener){
            this.viewport_change_listener();
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
        // calculate the offset of the top-left corner of the map
        var offsetLeft = 0,
        offsetTop = 0,
        map_type = this.map_types[0],
        viewport = this.viewport,
        map_canvas = this.map_canvas;
        if(viewport && this.map_types && this.map_types.length > 0){
            if(viewport['center'] && typeof(viewport['zoom']) == 'number'){ // if we have a center and zoom
                var center_point = viewport['center'] instanceof Point ? viewport['center'] : map_type['fromLatLngToPoint'](viewport['center']);
                offsetLeft = this.offsetLeft = (center_point.x - Math.round(map_canvas.width / 2));
                offsetTop = this.offsetTop = (center_point.y - Math.round(map_canvas.height / 2));
            } else if(viewport['bounds']){ // if we have LatLngBounds
            }
                    
            // render the tiles
            for(var i=0; i<this.map_types.length; i++){
                var map_type = this.map_types[i],
                tileWidth = map_type.options['width'] || 256,
                tileHeight = map_type.options['height'] || 256,
                x = Math.floor(offsetLeft / tileWidth); // this line needs to be corrected to allow for spanning backward past 0
                while(x * tileWidth < map_canvas.width + offsetLeft){
                    var y = Math.floor(offsetTop / tileHeight); // this line needs to be corrected to allow for spanning backward past 0
                    while(y * tileHeight < offsetTop + map_canvas.height){
                        map_type.placeTile(x, y, (this.viewport['zoom'] || 0));
                        y++;
                    }
                    x++;
                }
            }
        
            // render overlays
            var overlays = this.overlays;
            for(var i=0; overlays && i < overlays.length; i++){
                var overlay = overlays[i];
                overlay.draw();
            }
            
            // render markers
        
            // render infowindows

            if(this.map_render_listener){
                this.map_render_listener();
            }
        }
    };
    Map.prototype['getZoom'] = function(){
        return this.viewport['zoom'];
    };
    Map.prototype['zoomOut'] = function(){
        this['setViewport']({
            'zoom' : Math.max(0, this.viewport['zoom'] - 1)
        });
    };
    Map.prototype['zoomIn'] = function(){
        this['setViewport']({
            'zoom' : Math.max(0, this.viewport['zoom'] + 1)
        });
    };
    Map.prototype.addOverlay = function(overlay, dont_render){
        this.removeOverlay(overlay, 1)
        var overlays = this.overlays = this.overlays || [];
        overlays.push(overlay);
        if(!dont_render){
            this.render();
        }
        
        if(this.overlay_added_listener){
            this.overlay_added_listener();
        }
    };
    Map.prototype.removeOverlay = function(overlay, dont_render){
        var overlays = this.overlays;
        for(var i=0; overlays && i < overlays.length; i++){
            var test_overlay = overlays[i];
            if(test_overlay === overlay){
                overlays.splice(i, 1);
            }
        }
        if(!dont_render){
            this.render();
        }
        
        if(this.overlay_removed_listener){
            this.overlay_removed_listener();
        }
    };
    Map.prototype.start_drag = function(e){
        this.mousemove_listener = add_dom_event('mousemove', create_method_closure(this, Map.prototype.drag, [{
            e : e,
            center : this.get_center_as_pt()
        }]), window);

        if(this.drag_start_listener){
            this.drag_start_listener();
        }
    };
    Map.prototype.end_drag = function(e){
        remove_dom_event(this.mousemove_listener);

        if(this.drag_end_listener){
            this.drag_end_listener();
        }
    };
    Map.prototype.click = function(e){
        
    };
    Map.prototype.drag = function(anchor, e){
        var x_moved = anchor.e.clientX - e.clientX,
        y_moved = anchor.e.clientY - e.clientY,
        new_center_pt = new Point(
            anchor.center.x + x_moved,
            anchor.center.y + y_moved
        );
/* debugging only
        if(console && console.log){
            console.log(anchor);
            console.log(e);
            console.log(this.offsetLeft + ' | ' + this.offsetTop);
        }
 debugging only */
        this.setViewport({
            'center' : this.map_types[0]['fromPointToLatLng'](new_center_pt)
        });
        
        if(this.drag_listener){
            this.drag_listener();
        }
    };
    
    
    
    
    function Point(x, y){
        this.x = x;
        this.y = y;
    }
    Point.prototype['x'] = function(){
        return this.x;
    }
    Point.prototype['y'] = function(){
        return this.y;
    }
    make_public('Point', Point);
    
    
    
    
    function MapType(map, opt_options){
    }
    MapType.prototype['fromLatLngToPoint'] = function(pt){
        var lat = pt.lat,
        lng = pt.lng,
        pi = Math.PI,
        zoom = this.map['getZoom'](),
        e = Math.sin(lat * pi / 180);
        e = Math.max(e, -.9999);
        e = Math.min(e, .9999);

        var y = Math.round((256 * (Math.pow(2, zoom - 1))) + (.5 * Math.log((1 + e) / (1 - e)) * ((-256 * Math.pow(2, zoom)) / (2 * Math.PI)))),
        x = Math.round((256 * Math.pow(2, zoom - 1)) + (lng * ((256 * Math.pow(2, zoom)) / 360)));
        
        return new Point(x, y);
    };
    make_public('MapType', MapType);
    MapType.prototype['fromPointToLatLng'] = function(pt){
        var x = pt.x,
        y = pt.y,
        tileHeight = this.options['tileHeight'] || 256,
        tileWidth = this.options['tileWidth'] || 256,
        zoom = this.map['getZoom'](),
        pi = Math.PI,
        lng = (x - (256 * Math.pow(2, zoom - 1))) / (256 * Math.pow(2, zoom) / 360),
        e = (y - (256 * Math.pow(2, zoom - 1))) / (-256 * (Math.pow(2, zoom)) / (2 * pi)),
        lat = ((2 * Math.atan(Math.exp(e))) - (pi / 2)) / (pi / 180);
        
        lat = Math.max(lat, -90);
        lat = Math.min(lat, 90);

        if(lng < -180 || lng > 180){
            lng = lng % 360;
        }
        
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
    MapType.prototype.generateTile = function(x, y, zoom){
        var tiles = this.tiles = this.tiles || {};
        if(!tiles[zoom]){
            tiles[zoom] = {};
        }
        if(!tiles[zoom][x]){
            tiles[zoom][x] = {};
        }
        
        var img = tiles[zoom][x][y] = new Image;
        img.onload = create_method_closure(this, function(x, y, zoom){
            this.tiles[zoom][x][y].osm_webgl_ready = 1; // let's assign a property to verify that the tile is loaded
            this.map.render();
//            this.placeTile(x, y, zoom);
        }, [x, y, zoom]);
        img.src = this['resolveTileUrl'](x, y, zoom);
        
        tiles[zoom][x][y] = img;
    };
    MapType.prototype.placeTile = function(x, y, zoom){
//        console && console.log && console.log(([x, y, zoom]).join(' | ')); // debugging only
        var tiles = this.tiles = this.tiles || {},
        total_tiles = Math.pow(2, zoom),
        tileX = x % total_tiles, // the actual x coord of tile we're going to draw
        tileY = y % total_tiles, // the actual y coord of tile we're going to draw
        map = this.map,
        opt_options = this.options,
        tileWidth = opt_options['width'] || 256,
        tileHeight = opt_options['height'] || 256;
        if(tileX < 0){
            tileX = total_tiles + tileX;
        }
        if(tileY < 0){
            tileY = total_tiles + tileY;
        }
        var img = tiles[zoom] && tiles[zoom][tileX]? tiles[zoom][tileX][tileY] : undefined;
        if(img && img.osm_webgl_ready){
            var imgX = (x * tileWidth) - map.offsetLeft,
            imgY = (y * tileHeight) - map.offsetTop;
            if(imgX > -tileWidth && imgY > -tileHeight){
                map.context.drawImage(img, imgX, imgY);
            }
        } else if(!img){
            this.generateTile(tileX, tileY, zoom);
        }
    };
    MapType.STREET_MAP = function(map, opt_options){
        this.map = map;
        this.options = opt_options || {
            'max_zoom' : 19,
            'min_zoom' : 0
        };
    }
    extend_class(MapType.STREET_MAP, MapType);
    
    
    
    
    function Marker(opt_options){
        this['setOptions'](opt_options);
    }
    Marker.prototype.draw = function(){
        if(this.options['map']){
            var opt_options = this.options,
            map = opt_options['map'],
            context = map.context,
            position = map.map_types[0]['fromLatLngToPoint'](opt_options['position']);
// TODO: add support for tiling, in case the same location is displayed more than once
            if(opt_options['icon']){ // if we have an icon given, we'll need to get it and draw it in the correct place
                var img = this.img
                if(img){ // if we have the image already
                    var anchor = new Point( // get the anchoring point, which is relative to the upper-left corner of the marker. If we don't have one, we'll anchor it the center of the bottom of the image
                        opt_options['anchor'] ? opt_options['anchor'].x : img.height,
                        opt_options['anchor'] ? opt_options['anchor'].y : Math.round(img.width / 2)
                    ),
                    imgX = position.x - anchor.x - map.offsetLeft,
                    imgY = position.y - anchor.y - map.offsetTop;
                    context.drawImage(img, imgX, imgY);
                } else {
                    img = this.img = new Image;
                    img.src = opt_options['icon'];
                    img.onload = create_method_closure(this, Marker.prototype.draw);
                }
            } else { // if we're drawing a standard marker, let's do it.
                var startingPos = new Point(position.x - 3 - map.offsetLeft, position.y - 30 - map.offsetTop),
                anchorPos = new Point(position.x - map.offsetLeft, position.y - map.offsetTop),
                pole_width = 6,
                pole_half = Math.round(pole_width / 2),
                flag_height = 24,
                txt_width = opt_options['label'] ? context.measureText(opt_options['label']).width : 0,
                flag_width = Math.max(32, txt_width + 10),
                flag_x = startingPos.x + pole_half + 1,
                flag_perspective_difference = Math.round(pole_half * .75);
                context.lineWidth = 1;
                if(opt_options['label_font']){
                    context.font = opt_options['label_font'] || '14px Arial';
                }

                // draw the flag
                context.fillStyle = opt_options['color'] || 'rgba(255, 75, 75, 1)';
                context.beginPath();
                context.moveTo(startingPos.x + pole_width, startingPos.y);
                context.lineTo(startingPos.x + pole_width + flag_width, startingPos.y);
                context.lineTo(startingPos.x + pole_width + flag_width - flag_perspective_difference, startingPos.y + flag_height);
                context.lineTo(startingPos.x + pole_width - flag_perspective_difference, startingPos.y + flag_height);
                context.fill();

                // draw the flagpole
                for(var i=0; i < pole_width; i++){
                    var rgb_val = 175 - (50 * Math.max(i - pole_half, 0));
                    context.beginPath();
                    context.moveTo(startingPos.x + i, startingPos.y);
                    context.lineTo(anchorPos.x, anchorPos.y);
                    context.strokeStyle = 'rgba(' + rgb_val + ', ' + rgb_val + ', ' + rgb_val + ', 1)';
                    context.stroke();
                }
                
                // draw the cap of the flagpole
                context.beginPath();
                context.moveTo(startingPos.x, startingPos.y);
                context.bezierCurveTo(startingPos.x, startingPos.y - 2, startingPos.x + pole_width, startingPos.y - 2, startingPos.x + pole_width, startingPos.y);
                context.bezierCurveTo(startingPos.x + pole_width, startingPos.y + 2, startingPos.x, startingPos.y + 2, startingPos.x, startingPos.y);
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
                        startingPos.x + pole_width + txt_x,
                        startingPos.y + flag_height - Math.round((flag_height - (txt_height * .66)) / 2)
                    );
                }
            }
        }
    };
    Marker.prototype['setOptions'] = function(opt_options){
        this.options = {}; // default options
        for(var i in opt_options){
            this.options[i] = opt_options[i];
        }
        var map = opt_options['map'];
        if(map){
            map.addOverlay(this, 1);
            this.draw();
        }
        this.txt_height = undefined;
    };
    make_public('Marker', Marker);
    
    
    
    
    function InfoWindow(opt_options){
    }
    make_public('InfoWindow', InfoWindow);
    
    
    function LatLngBounds(){
        this.extend(arguments);
    }
    LatLngBounds.prototype['extend'] = function(){
        for(var i=0; i<arguments.length; i++){
            var new_latlng = arguments[i];
            if(this.sw){
                this.sw = new LatLng(
                    Math.min(this.sw.lat, new_latlng.lat),
                    Math.min(this.sw.lng, new_latlng.lng)
                );
            } else{
                this.sw = new_latlng;
            }
            if(this.ne){
                this.new = new LatLng(
                    Math.max(this.sw.lat, new_latlng.lat),
                    Math.max(this.sw.lng, new_latlng.lng)
                );
            } else {
                this.ne = new_latlng;
            }
        }
    };
    make_public('LatLngBounds', LatLngBounds);
    
    
    
    
    function LatLng(lat, lng){
        this.lat = lat;
        this.lng = lng;
    }
    LatLng.prototype['lat'] = function(){
        return this.lat;
    }
    LatLng.prototype['lng'] = function(){
        return this.lng;
    }
    make_public('LatLng', LatLng);




    function MapControl(map, opt_options){
        
    }
    
    
    
    
    
    
    // Utility functions
    
    function extend_class(child_class, parent_class){
        var intermediary_class = function(){};
        intermediary_class.prototype = parent_class.prototype;
        child_class.prototype = new intermediary_class;
    }
    
    
    
    
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
    make_public('addDOMListener', add_dom_event);
    
    
    
    
    function remove_dom_event(event_obj){
        event_obj.target.removeEventListener(
            event_obj.type,
            event_obj.listener,
            event_obj.use_capture
        );
    }
    make_public('removeDOMistener', remove_dom_event);
    
    
    
    
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