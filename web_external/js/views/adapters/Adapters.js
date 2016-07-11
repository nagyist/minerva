minerva.core = minerva.core || {};

(function () {
    /**
     * Definition of the AdapterRegistry, which maps adapters types
     * to adapter defintions.
     */
    function AdapterRegistry() {
        this.registry = {};

        /**
         * Register an adapter definition to a type name, overriding any existing
         * definition for that type name.
         *
         * @param {string} type - The type name of the adapter
         * @param {minerva.rendering.geo.MapRepresentation} definition - The definition of a GeoJs layer representation
         */
        this.register = function (type, definition) {
            this.registry[type] = definition;
        };

        /**
         * Async function to create a representation for the passed in dataset
         * of the desired layerType, to be rendered in the passed in MapContainer.
         *
         * @param {Object} container - An implementor of the MapContainer interface
         * @param {minerva.models.DatasetModel} dataset - The dataset to be rendered
         * @param {string} layerType - The type of map visualization used to render the dataset
         * @param {Object} visProperties - Properties used to render the dataset as a layerType
         * @fires 'm:map_adapter_layerCreated' event upon successful layer creation
         * @fires 'm:map_adapter_layerError' event upon an error creating the layer
         */
        this._createRepresentation = function (container, dataset, layerType, visProperties) {
            if (layerType === null || !_.has(this.registry, layerType)) {
                console.error('This dataset cannot be adapted to a map layer of type [' + layerType + '].');
                this.trigger('m:map_adapter_error', dataset, layerType);
                return;
            } else {
                var Adapter = this.registry[layerType];
                var layerRepr = _.extend(new Adapter(), Backbone.Events);
                dataset.once('m:dataset_geo_dataLoaded', function () {
                    layerRepr.once('m:map_layer_renderable', function (layer) {
                        this.trigger('m:map_adapter_layerCreated', layer);
                    }, this).once('m:map_layer_error', function (layer) {
                        this.trigger('m:map_adapter_layerError', layer);
                    }, this).init(container, dataset, visProperties, dataset.get('geoData'));
                }, this).loadGeoData();
                //
                // Instead of dataset.loadGeoData, ideally this would allow a call
                // to the server to load the geo data rendered.
                //
                // girder.RestRequest({
                //     type: "POST"
                //     url: "adapter/" + dataset._id + "/" + layerType.toString()(),
                //     params: userInput,
                // }).success(function (data){
                //     createLayer
                // });
            }
        };
    }
    minerva.core.AdapterRegistry = _.extend(new AdapterRegistry(), Backbone.Events);
})();

minerva.rendering = minerva.rendering || {};
minerva.rendering.geo = minerva.rendering || {};

/**
 * Utility function to define a map representation and add it to the Adapter Registry.
 * @param {string} layerType - The type of map visualization used to render the dataset
 * @param {minerva.rendering.geo.MapRepresentation} layerDefinition - The definition of a GeoJs layer representation
 * @param {minerva.rendering.geo.MapRepresentation} [ParentDefinition] - The definition of a GeoJs layer representation,
 * to be used as the constructor set as the prototype of layerDefinition
 */
minerva.rendering.geo.defineMapLayer = function (layerType, layerDefinition, ParentDefinition) {
    if (ParentDefinition) {
        layerDefinition.prototype = new ParentDefinition();
    }
    minerva.core.AdapterRegistry.register(layerType, layerDefinition);
    return layerDefinition;
};

/**
 * Base MapRepresentation definition, with type 'map'.
 */
minerva.rendering.geo.MapRepresentation = minerva.rendering.geo.defineMapLayer('map', function () {
    /**
     * Delete this instance of a MapRepresentation from the MapContainer
     *
     * @param {Object} container - An implementor of the MapContainer interface
     */
    this.delete = function (container) {
        container.deleteLayer(this.geoJsLayer);
    };

    /**
     * Set the opacity on the rendered instance of a MapRepresentation
     *
     * @param {number} opacity - Opacity value between 0 and 1
     */
    this.setOpacity = function (opacity) {
        this.geoJsLayer.opacity(opacity);
    };

    /**
     * Render this instance of a MapRepresentation into the MapContainer
     *
     * @param {Object} container - An implementor of the MapContainer interface
     */
    this.render = function (container) {
        container.renderMap();
    };
});

/**
 * Generic GeoJson MapRepresentation definition, with type 'geojson'.
 */
minerva.rendering.geo.GeometryRepresentation = minerva.rendering.geo.defineMapLayer('geojson', function () {
    this.readerType = 'jsonReader';

    // Commented out init as a temp workaround.
    /**
     * Async function to define a rendered GeoJs geojson layer for the passed
     * in dataset.
     *
     * @param {Object} container - An implementor of the MapContainer interface
     * @param {minerva.models.DatasetModel} dataset - The dataset to be rendered
     * @param {Object} visProperties - Properties used to render the dataset as a GeoJson layer
     * @param {string} data - The data to be rendered in the layer, assumed to be json
     * @fires 'm:map_layer_renderable' event upon successful layer render definition
     * @fires 'm:map_layer_error' event upon an error defining the layer rendering
     * /
    this.init = function (container, dataset, visProperties, data) {
        this.geoJsLayer = container.createLayer('feature');
        try {
            var reader = geo.createFileReader(this.readerType, {layer: this.geoJsLayer});
            reader.read(data, _.bind(function () {
                this.trigger('m:map_layer_renderable', this);
            }, this));
        } catch (err) {
            console.error('This layer cannot be rendered to the map');
            console.error(err);
            this.trigger('m:map_layer_error', this);
        }
    };*/

    /**
     * Temporary method that mutates a geojson data object to get around geojs limitations.
     * Returns an object containing arrays of `point`, `line`, and `polygon` geometries.
     * @private
     */
    function flattenFeatures(data) {
        if (_.isString(data)) {
            data = JSON.parse(data);
        }
        if (data.type !== 'FeatureCollection') {
            throw new Error('Unsupported GeoJSON type');
        }

        var geoms = _.chain(data.features || [])
            .where({type: 'Feature'})
            .pluck('geometry')
            .map(function (geom) {
                // mutate polygon features into line features to avoid slow triangulation
                geom = geom || {};
                if (geom.type === 'Polygon') {
                    geom.type = 'MultiLineString';
                    geom.coordinates = geom.coordinates;
                } else if (geom.type === 'MultiPolygon') {
                    geom.type = 'MultiLineString';
                    geom.coordinates = _.flatten(geom.coordinates, true);

                // transform Lines into MultiLines
                } else if (geom.type === 'LineString') {
                    geom.type = 'MultiLineString';
                    geom.coordinates = [geom.coordinates];

                // transform points in to multipoints
                } else if (geom.type === 'Point') {
                    geom.type = 'MultiPoint';
                    geom.coordinates = [geom.coordinates];
                }

                return geom;
            })
            .groupBy('type')
            .value();

       function flatten(geom) {
            return _.chain(geom || [])
                .pluck('coordinates')
                .flatten(true)
                .value();
       }
       return {
           points: flatten(geoms.MultiPoint),
           lines: flatten(geoms.MultiLineString),
           polygons: flatten(geoms.MultiPolygon)
       }
    }

    function position(d) {
        return {
            x: d[0],
            y: d[1],
            z: d[2] || 0
        };
    }

    this.init = function (container, dataset, visProperties, data) {
        this.geoJsLayer = container.createLayer('feature');
        try {
            data = flattenFeatures(data);

            if (data.points.length) {
                this.geoJsLayer.createFeature('point')
                    .position(position)
                    .style({
                        fillColor: 'red',
                        strokeColor: 'black'
                    })
                    .data(data.points);
            }

            if (data.lines.length) {
                this.geoJsLayer.createFeature('line')
                    .position(position)
                    .style({
                        strokeColor: 'black'
                    })
                    .data(data.lines);
            }

            // TODO:
            // polygon = this.geoJsLayer.createFeature('polygon');


            this.trigger('m:map_layer_renderable', this);
        } catch (err) {
            console.error('This layer cannot be rendered to the map');
            console.error(err);
            this.trigger('m:map_layer_error', this);
        }
    };
}, minerva.rendering.geo.MapRepresentation);

/**
 * Generic GeoJs Contour MapRepresentation definition, with type 'contour'.
 */
minerva.rendering.geo.ContourRepresentation = minerva.rendering.geo.defineMapLayer('contour', function () {
    this.readerType = 'contourJsonReader'
}, minerva.rendering.GeometryRepresentation);

/**
 * Generic GeoJs Choropleth MapRepresentation definition, with type 'choropleth'.
 */
minerva.rendering.geo.ChoroplethRepresentation = minerva.rendering.geo.defineMapLayer('choropleth', function () {
    /**
     * Async function to define a rendered GeoJs geojson choropleth layer for the passed
     * in dataset.
     *
     * @param {Object} container - An implementor of the MapContainer interface
     * @param {minerva.models.DatasetModel} dataset - The dataset to be rendered
     * @param {Object} visProperties - Properties used to render the dataset as a GeoJson choropleth layer
     * @param {string} visProperties.colorByValue - The key in jsonData whose value should be colored by
     * @param {string} visProperties.colorScheme - Name of a colorbrewer color scheme, to color the chorlopleth
     * @param {string} jsonData - The data to be rendered in the layer, assumed to be json
     * @fires 'm:map_layer_renderable' event upon successful layer render definition
     * @fires 'm:map_layer_error' event upon an error defining the layer rendering
     */
    this.init = function (container, dataset, visProperties, jsonData) {
        // Set the visProperties from the dataset as a HACK,
        // though they should come from visProperties.
        visProperties.colorByValue = dataset.getMinervaMetadata().colorByValue;
        visProperties.colorScheme = dataset.getMinervaMetadata().colorScheme;

        this.geoJsLayer = container.createLayer('feature');
        var data = [];

        var polygon = this.geoJsLayer.createFeature('polygon', {selectionAPI: true});
        // Loop through the data and transform multipolygons into
        // arrays of polygons.  Note: it would also be possible
        // to generate a polygon feature for each polygon/multipolygon
        // geometry in the geojson, but this would (1) inefficient, and
        // (2) make handling mouse events much more difficult.
        JSON.parse(jsonData).features.forEach(function (f) {
            if (f.geometry.type === 'Polygon') {
                data.push({
                    outer: f.geometry.coordinates[0],
                    inner: f.geometry.coordinates.slice(1),
                    properties: f.properties
                });
            } else if (f.geometry.type === 'MultiPolygon') {
                f.geometry.coordinates.forEach(function (p) {
                    // all of the split polygons share the same property object
                    data.push({
                        outer: p[0],
                        inner: p.slice(1),
                        properties: f.properties
                    });
                });
            }
        });

        var value = function (_a, _b, d) {
            return (d || {}).properties[visProperties.colorByValue] || 0;
        };

        // the data extent
        var extent = d3.extent(data, function (d) {
            return d.properties[visProperties.colorByValue];
        });

        // generate the color scale
        var domain = [extent[0], 0.5 * (extent[0] + extent[1]), extent[1]];
        var scale = d3.scale.linear()
            .domain(domain)
            .range(colorbrewer[visProperties.colorScheme][3]);

        polygon.position(function (d) {
            return {
                x: d[0],
                y: d[1],
                z: d[2] || 0
            };
        }).style({
            fillColor: function () {
                var v = value.apply(value, arguments);
                var c = scale(v);
                c = geo.util.convertColor(c);
                return c;
            }
        }).data(data);

        var clickInfo = new minerva.models.ClickInfoModel();

        polygon.geoOn(geo.event.feature.mouseclick, _.bind(function (d) {
            clickInfo.set({
                layer: this.geoJsLayer,
                dataset: dataset,
                mouse: d.mouse,
                datum: d.data.properties
            });

            if (!this.clickInfoWidget) {
                this.clickInfoWidget = new minerva.views.ClickInfoWidget({
                    model: clickInfo,
                    parentView: container.getMapView()
                });
            }
        }, this));
        this.trigger('m:map_layer_renderable', this);
    };
}, minerva.rendering.geo.MapRepresentation);

/**
 * GeoJs WMS MapRepresentation definition, with type 'wms'.
 */
minerva.rendering.geo.WmsRepresentation = minerva.rendering.geo.defineMapLayer('wms', function () {
    /**
     * Async function to define a rendered GeoJs wms layer for the passed in dataset.
     *
     * @param {Object} container - An implementor of the MapContainer interface
     * @param {minerva.models.DatasetModel} dataset - The dataset to be rendered
     * @fires 'm:map_layer_renderable' event upon successful layer render definition
     * @fires 'm:map_layer_error' event upon an error defining the layer rendering
     */
    this.init = function (container, dataset) {
        this.geoJsLayer = container.createLayer('osm', {
            attribution: null,
            keepLower: false
        });
        container.addFeatureInfoLayer(this.geoJsLayer);
        var minervaMetadata = dataset.metadata();
        this.geoJsLayer.layerName = minervaMetadata.type_name;
        this.geoJsLayer.baseUrl = '/wms_proxy/' + encodeURIComponent(minervaMetadata.base_url);
        var projection = 'EPSG:3857';
        this.geoJsLayer.url(
            _.bind(function (x, y, zoom) {
                var bb = this.geoJsLayer.gcsTileBounds({x: x, y: y, level: zoom}, projection);
                var bbox_mercator = bb.left + ',' + bb.bottom + ',' + bb.right + ',' + bb.top;
                var params = {
                    SERVICE: 'WMS',
                    VERSION: '1.1.1',
                    REQUEST: 'GetMap',
                    LAYERS: this.geoJsLayer.layerName,
                    STYLES: '',
                    BBOX: bbox_mercator,
                    WIDTH: 256,
                    HEIGHT: 256,
                    FORMAT: 'image/png',
                    TRANSPARENT: true,
                    SRS: projection,
                    TILED: true
                };
                if (minervaMetadata.hasOwnProperty('credentials')) {
                    params.minerva_credentials = minervaMetadata.credentials;
                }
                return this.geoJsLayer.baseUrl + '?' + $.param(params);
            }, this)
        );
        this.trigger('m:map_layer_renderable', this);
    };
}, minerva.rendering.geo.MapRepresentation);