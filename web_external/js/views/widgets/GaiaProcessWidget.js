/**
* This widget is used to add/edit gaia processes.
*/
minerva.views.GaiaProcessWidget = minerva.View.extend({

    events: {
        'submit #m-gaia-process-form': function (e) {
            e.preventDefault();
            var inputs = [];
            var process;

            var processName = $('#m-gaiaProcessDatasetName').val();

            var capitalizeFirstLetter = function (string) {
                return string.charAt(0).toUpperCase() + string.slice(1);
            };

            $('input[type=text], select').each(function () {
                if (!$(this).val()) {
                    return;
                } else {
                    var value;
                    try {
                        value = JSON.parse($(this).val());
                        console.log(value)
                        if (value.type) {
                            inputs.push({
                                '_type': 'girder.plugins.gaia_minerva.inputs.Minerva' + capitalizeFirstLetter(value.type) + 'IO',
                                'item_id': value.layer.id
                            });
                        }
                        if (!value.type) {
                            process = _.first(_.keys(value));
                        }
                    } catch (err) {

                    }
                }
            });

            var query = Object.assign({
                '_type': 'gaia.geo.' + process
            }, {inputs: inputs})

            girder.restRequest({
                path: 'gaia_analysis?datasetName=' + processName + '&process=' + JSON.stringify(query),
                type: 'POST'
            }).done(_.bind(function () {
                girder.events.trigger('m:job.created');
                this.$el.modal('hide');
            }, this));
        },
        'change #m-gaia-process-type': 'renderProcessInputs'
    },

    renderProcessInputs: function () {
        // Clear input dom
        $('#m-gaia-process-inputs').html('');
        $('#m-gaia-process-args').html('');

        var process = this.$('#m-gaia-process-type').val();
        try {
            // parse for side effect of validation
            JSON.parse(process);
            this.$('.g-validation-failed-message').text('');
        } catch (err) {
            this.$('.g-validation-failed-message').text('Error with getting layer data');
            return;
        }
        this.requiredInputs = _.first(_.values(JSON.parse(process))).required_inputs;
        this.requiredArguments = _.first(_.values(JSON.parse(process))).required_args;

        var gaiaArgsView = _.map(this.requiredArguments, _.bind(function (value, title) {
            return minerva.templates.gaiaProcessArgsWidget({
                type: value,
                title: this.splitOnUnderscore(title)
            });
        }, this));
        $('#m-gaia-process-args').append(gaiaArgsView);
        var gaiaInputsView = _.flatten(_.map(this.requiredInputs, _.bind(function (value, type) {
            var numberOfPossibleLayers = value.min;
            return _.times(numberOfPossibleLayers, _.bind(function () {
                return minerva.templates.gaiaProcessInputsWidget({
                    layers: this.layers,
                    type: type
                });
            }, this));
        }, this)));
        $('#m-gaia-process-inputs').append(gaiaInputsView);
    },

    structureGaiaJSON: function (process) {

    },

    splitOnCaps: function (string) {
        if (!string) {
            return;
        }
        return string.split(/(?=[A-Z])/).join(' ');
    },

    splitOnUnderscore: function (string) {
        if (!string) {
            return;
        }
        return string.match(/([^_]+)/g).join(' ');
    },

    renderListOfAvailableProcesses: function () {
        girder.restRequest({
            path: 'gaia_process/classes',
            type: 'GET'
        }).done(_.bind(function (data) {
            if (data && data.processes) {
                this.processes = data.processes.map(_.bind(function (process) {
                    var processName = _.first(_.keys(process));
                    var formattedProcessName = this.splitOnCaps(processName);
                    return {title: formattedProcessName, data: JSON.stringify(process)};
                }, this)).sort();
                this.render();
            }
        }, this));
    },

    initialize: function (settings) {
        this.collection = settings.datasetCollection;
        this.processes = [];
        this.requiredInputs = {};
        // Get list of available processes on initialize
        this.renderListOfAvailableProcesses();
        this.layers = [];
    },

    getSourceNameFromModel: function (model) {
        return (((model.get('meta') || {}).minerva || {}).source || {}).layer_source;
    },

    render: function () {
        this.sourceDataset = _.groupBy(
            _.filter(this.collection.models, this.getSourceNameFromModel),
            this.getSourceNameFromModel
        );
        if (this.sourceDataset && this.sourceDataset.GeoJSON) {
            this.layers = this.sourceDataset.GeoJSON.map(function (dataset) {
                return {title: dataset.get('name'), id: dataset.get('_id')};
            });
        }
        var modal = this.$el.html(minerva.templates.gaiaProcessWidget({
            processes: this.processes
        })).girderModal(this).on('ready.girder.modal', _.bind(function () {
        }, this));
        modal.trigger($.Event('ready.girder.modal', {relatedTarget: modal}));
        return this;
    }
});