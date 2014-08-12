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
            context.fillStyle = 'rgba(100, 100, 100, 0.5)';
            context.fillRect(0, 0, map_canvas.width, map_canvas.height);
        }
        this.context = context;
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
    };
    Map.prototype['setViewport'] = function(viewport){
        this.viewport = viewport;
        this.render();
    };
    Map.prototype.render = function(){
        // calculate the offset of the top-left corner of the map
        var offsetLeft = 0,
        offsetTop = 0,
        map_type = this.map_types[0],
        viewport = this.viewport,
        map_canvas = this.map_canvas;
        if(viewport && this.map_types && this.map_types.length > 0){
            if(viewport['center']){
                var center_point = map_type['fromLatLngToPoint'](viewport['center']);
                offsetLeft = this.offsetLeft = Math.max(0, center_point.x - Math.round(map_canvas.width / 2));
                offsetTop = this.offsetTop = Math.max(0, center_point.y - Math.round(map_canvas.height / 2));
            }
                    
            // render the tiles
            for(var i=0; i<this.map_types.length; i++){
                var map_type = this.map_types[i],
                tileWidth = map_type.options['width'] || 256,
                tileHeight = map_type.options['height'] || 256,
                x = Math.floor(offsetLeft / tileWidth),
                y = Math.floor(offsetTop / tileHeight);
                while(x * tileWidth < offsetLeft + map_canvas.width){
                    while(y * tileHeight < offsetTop + map_canvas.height){
                        map_type.placeTile(x, y, (this.viewport['zoom'] || 0));
                        y++;
                    }
                    x++;
                }
            }
        
            // render overlays

            // render markers
        
            // render infowindows
        }
    };
    Map.prototype['getZoom'] = function(){
        return this.viewport['zoom'];
    };
    
    
    
    
    function Point(x, y){
        this.x = x;
        this.y = y;
    }
    
    
    
    
    function MapType(map, opt_options){
    }
    MapType.prototype['fromLatLngToPoint'] = function(pt){
        var lat = pt.lat,
        lng = pt.lng,
        pi = Math.pi(),
        zoom = this.map['getZoom'](),
        e = Math.sin(lat * pi / 180);
        e = Math.max(e, -.9999);
        e = Math.min(e, .9999);

        var y = Math.round((256 * (Math.pow(2, zoom - 1))) + (.5 * Math.log((1 + e) / (1 - e)) * ((-256 * Math.pow(2, zoom)) / (2 * Math.pi())))),
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
        pi = Math.pi(),
        lng = (x - Math(2, zoom - 1)) / (Math(2, zoom) / 360),
        e = (y - Math(2, zoom - 1)) / (-(Math.pow(2, zoom)) / (2 * pi)),
        lat = ((2 * Math.atan(Math.log(e))) - (pi / 2)) / (pi / 180);
        
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
            this.placeTile(x, y, zoom);
        }, [x, y, zoom]);
        img.src = this['resolveTileUrl'](x, y, zoom);
        
        tiles[zoom][x][y] = img;
    };
    MapType.prototype.placeTile = function(x, y, zoom){
        var tiles = this.tiles = this.tiles || {},
        x = x % Math.pow(2, zoom),
        y = y % Math.pow(2, zoom),
        img = tiles[zoom] && tiles[zoom][x]? tiles[zoom][x][y] : undefined,
        map = this.map,
        opt_options = this.options,
        tileWidth = opt_options['width'] || 256,
        tileHeight = opt_options['height'] || 256;
        if(img && img.osm_webgl_ready){
            var imgX = (x * tileWidth) - map.offsetLeft,
            imgY = (y * tileHeight) - map.offsetTop;
            if(imgX > -tileWidth && imgY > -tileHeight){
                map.context.drawImage(img, imgX, imgY);
            }
        } else if(!img){
            this.generateTile(x, y, zoom);
        }
    };
    MapType.STREET_MAP = function(map, opt_options){
        this.map = map;
        this.options = opt_options || {};
    }
    extend_class(MapType.STREET_MAP, MapType);
    
    
    
    
    function Marker(opt_options){
    }
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
    make_public('LatLng', LatLng);
    
    
    
    
    
    
    
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
    
    
    
    if(!Math.pi){ // define a Math.pi function
        Math.pi = function(){
            return 3.14159265359;
        }
    }
    
    
    
    
    function make_public(public_name, method){
        if(!window['_osm']){
            window['_osm'] = {}
        }
        window['_osm'][public_name] = method;
    }
})()