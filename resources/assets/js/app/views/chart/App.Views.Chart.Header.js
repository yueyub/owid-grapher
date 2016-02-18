;( function() {
	
	"use strict";
	
	var App = require( "./../../namespaces.js" );

	App.Views.Chart.Header = Backbone.View.extend({

		DEFAULT_LOGO_URL: "uploads/26538.png",

		el: "#chart-view .chart-header",
		events: {},

		initialize: function( options ) {
			
			this.dispatcher = options.dispatcher;
			this.parentView = options.parentView;

			this.$chartName = this.$el.find( ".chart-name" );
			this.$chartSubname = this.$el.find( ".chart-subname" );

			this.$logo = this.$el.find( ".logo" );
			this.$logoSvg = $( ".chart-logo-svg" );
			this.$logoSvgImage = this.$logoSvg.find( ".chart-logo-svg-image" );
			this.$logoSvgVector = this.$logoSvg.find( ".chart-logo-svg-vector" );

			this.$tabs = this.$el.find( ".header-tab" );
//			this.render();

			//setup events
			App.ChartModel.on( "change", this.render, this );
			App.ChartModel.on( "change-map", this.render, this );
		},

		render: function( data ) {
			var that = this,
				chartName = App.ChartModel.get( "chart-name" ),
				addCountryMode = App.ChartModel.get( "add-country-mode" ),
				selectedCountries = App.ChartModel.get( "selected-countries" ),
				logo = App.ChartModel.get( "logo" ),
				tabs = App.ChartModel.get( "tabs" ),
				defaultTab = App.ChartModel.get( "default-tab" ),
				openDefault = ( this.$tabs.filter( ".active" ).length )? false: true;

			//might need to replace country in title, if "change country" mode
			if( addCountryMode === "change-country" ) {
				console.log( "addCountryMode", selectedCountries );
				//yep, probably need replacing country in title (select first country form stored one)
				if( selectedCountries && selectedCountries.length ) {
					var country = selectedCountries[0];
					chartName = chartName.replace( "*country*", country.name );
				}
			}

			//update name
			this.$chartName.text( chartName );
			//if there's time placeholder - time
			if( chartName ) {
				if( chartName.indexOf( "*time*" ) > -1 || chartName.indexOf( "*timeFrom*" ) > -1 || chartName.indexOf( "*timeTo*" ) > -1 ) {
					this.$chartName.css( "visibility", "hidden" );
				}
			}

			//update subname
			this.$chartSubname.html( App.ChartModel.get( "chart-subname" ) );

			//setup image for header
			if( logo ) {

				var fullUrl = Global.rootUrl + "/" + logo;
				this.$logo.attr( "src", fullUrl );
				this.$logo.css( "visibility", "visible" );
				this.$logoSvgImage.attr( "xlink:href", fullUrl );

				//after logo is loaded, resize svg image to the same 
				this.$logo.on( "load", function() {
					that.$logoSvgImage.attr( { "width": this.width, "height": this.height } );
				} );

			}

			//should be displayed
			if( logo === this.DEFAULT_LOGO_URL ) {
				this.$logoSvg.attr( "class", "chart-logo-svg default-logo" );
			} else {
				this.$logoSvg.attr( "class", "chart-logo-svg" );
			}

			//hide first everything
			this.$tabs.hide();

			_.each( tabs, function( v, i ) {
				var tab = that.$tabs.filter( "." + v + "-header-tab" );
				tab.show();
				if( v === defaultTab && openDefault ) {
					tab.addClass( "active" );
				}
			} );

			//for first visible tab, add class for border-left, cannot be done in pure css http://stackoverflow.com/questions/18765814/targeting-first-visible-element-with-pure-css
			this.$tabs.removeClass( "first" );
			this.$tabs.filter( ":visible:first" ).addClass( "first" );

			this.updateTime();
		},

		updateTime: function() {
			// Replace *time* and similar in the chart title, but only if we need to
			var chartName = this.$chartName.text();
			if (chartName.indexOf("*time*") == -1 && chartName.indexOf("*timeFrom*") == -1 && chartName.indexOf("*timeTo*") == -1)
				return;

			var that = this;
			var tabs =	App.ChartModel.get( "tabs" ),
				activeTab = _.find(tabs, function(tab) { return that.$tabs.filter("." + tab + "-header-tab.active").length > 0});

			if (activeTab == "map") {
				if (this.parentView.mapTab.mapDataModel !== undefined) {
					var data = this.parentView.mapTab.mapDataModel.get("data");
					if (data !== undefined)
						this.updateTimeFromMap(data);
				}
			} else {
				if (this.parentView.chartTab !== undefined)
					this.updateTimeFromChart(this.parentView.chartTab.localData);
			}
		},

		updateTimeFromChart: function( data ) {
			//is there any time placeholder to update at all?
			var chartName = this.$chartName.text();
			//find minimum and maximum in all displayed data
			var dimsString = App.ChartModel.get("chart-dimensions"),
				dims = $.parseJSON( dimsString ),
				latestAvailable = false,
				timeFrom = d3.min( data, function( entityData ) {
					return d3.min( entityData.values, function( d ) { return parseInt( d.time, 10 ); } );
				} ),
				timeTo = d3.max( data, function( entityData ) {
					return d3.max( entityData.values, function( d ) { return parseInt( d.time, 10 ); } );
				} );

			_.each( dims, function( dimension ) {
				if( dimension.mode === "specific" && dimension.period === "single" ) {
					var tolerance = +dimension.tolerance,
						dimMax = +dimension.targetYear + tolerance,
						dimMin = +dimension.targetYear - tolerance;
					//possibly set new timeFrom/timeTo values based on dimension settings
					timeFrom = Math.min( timeFrom, dimMin );
					timeTo = Math.max( timeTo, dimMax );
				} else if( dimension.mode === "latest" ) {
					latestAvailable = true;
				}

			} );

			chartName = this.replaceTimePlaceholder( chartName, timeFrom, timeTo, latestAvailable );
			this.$chartName.text( chartName );
			this.$chartName.css( "visibility", "visible" );
		},

		updateTimeFromMap: function(data) {
			var timeFrom = d3.min(data, function(d) { return parseInt(d.time); }),
				timeTo = d3.max(data, function(d) { return parseInt(d.time); }),
				targetYear = App.ChartModel.get("map-config").targetYear;

			var chartName = this.$chartName.text();
			var chartSubname = this.$chartSubname.text();
			chartName = this.replaceTimePlaceholder( chartName, targetYear, targetYear, false );
			if (timeFrom != timeTo)
				chartSubname += " Since observations made in " + targetYear + " are not available in all countries the map displays data from " + timeFrom + " to " + timeTo + ".";
			this.$chartName.text( chartName );
			this.$chartName.css( "visibility", "visible" );
			this.$chartSubname.text(chartSubname);
		},

		replaceTimePlaceholder: function( string, timeFrom, timeTo, latestAvailable ) {
			var time = ( !latestAvailable )? ( timeFrom !== timeTo )? timeFrom + " to " + timeTo: timeFrom: " latest available data";

			string = string.replace( "*time*", time );
			string = string.replace( "*timeFrom*", timeFrom );
			string = string.replace( "*timeTo*", timeTo );

			return string;
		}

	});

	module.exports = App.Views.Chart.Header;

})();