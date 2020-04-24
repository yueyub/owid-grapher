/* ChartUrl.ts
 * ================
 *
 * This component is responsible for translating between the
 * the chart and url parameters, to enable nice linking support
 * for specific countries and years.
 */
import { computed, when, runInAction, toJS, observable } from "mobx"

import { BAKED_GRAPHER_URL, EPOCH_DATE } from "settings"

import {
    includes,
    uniq,
    defaultTo,
    formatDay,
    diffDateISOStringInDays
} from "./Util"
import { ChartTabOption } from "./ChartTabOption"
import { ChartConfig } from "./ChartConfig"
import {
    queryParamsToStr,
    strToQueryParams,
    QueryParams
} from "utils/client/url"
import { MapProjection } from "./MapProjection"
import { ObservableUrl } from "./UrlBinding"
import {
    formatTimeBound,
    isUnbounded,
    TimeBoundValue,
    TimeBound,
    parseTimeBound
} from "./TimeBounds"

export interface ChartQueryParams {
    tab?: string
    overlay?: string
    stackMode?: string
    zoomToSelection?: string
    xScale?: string
    yScale?: string
    time?: string
    year?: string
    region?: string
    country?: string
    shown?: string
    endpointsOnly?: string
}

const reISODateComponent = new RegExp("\\d{4}-[01]\\d-[0-3]\\d")
const reISODate = new RegExp(`^(${reISODateComponent.source})$`)

function formatTimeURIComponent(time: TimeBound, isDate: boolean): string {
    if (isUnbounded(time)) return formatTimeBound(time)
    return isDate ? formatDay(time, { format: "YYYY-MM-DD" }) : `${time}`
}

function parseTimeURIComponent(
    param: string,
    defaultValue: TimeBound
): TimeBound {
    if (reISODate.test(param)) {
        return diffDateISOStringInDays(param, EPOCH_DATE)
    }
    return parseTimeBound(param, defaultValue)
}

export class ChartUrl implements ObservableUrl {
    chart: ChartConfig
    chartQueryStr: string = "?"
    mapQueryStr: string = "?"
    debounceMode: boolean = false

    constructor(chart: ChartConfig, queryStr?: string) {
        this.chart = chart

        if (queryStr !== undefined) {
            this.populateFromQueryParams(strToQueryParams(queryStr))
        }
    }

    @computed get origChartProps() {
        return this.chart.origProps
    }

    // Autocomputed url params to reflect difference between current chart state
    // and original config state
    @computed.struct get params(): QueryParams {
        const params: ChartQueryParams = {}
        const { chart, origChartProps } = this

        params.tab =
            chart.props.tab === origChartProps.tab ? undefined : chart.props.tab
        //params.overlay = chart.props.overlay === origChartProps.overlay ? undefined : chart.props.overlay
        params.xScale =
            chart.props.xAxis.scaleType === origChartProps.xAxis.scaleType
                ? undefined
                : chart.xAxis.scaleType
        params.yScale =
            chart.props.yAxis.scaleType === origChartProps.yAxis.scaleType
                ? undefined
                : chart.yAxis.scaleType
        params.stackMode =
            chart.props.stackMode === origChartProps.stackMode
                ? undefined
                : chart.props.stackMode
        params.zoomToSelection =
            chart.props.zoomToSelection === origChartProps.zoomToSelection
                ? undefined
                : chart.props.zoomToSelection
                ? "true"
                : undefined
        params.endpointsOnly =
            chart.props.compareEndPointsOnly ===
            origChartProps.compareEndPointsOnly
                ? undefined
                : chart.props.compareEndPointsOnly
                ? "1"
                : "0"
        params.year = this.yearParam
        params.time = this.timeParam
        params.country = this.countryParam

        if (
            chart.props.map &&
            origChartProps.map &&
            chart.props.map.projection !== origChartProps.map.projection
        )
            params.region = chart.props.map.projection

        return params as QueryParams
    }

    @computed get queryStr(): string {
        const queryParams = {
            ...this.params,
            ...this.externallyProvidedParams
        }
        return queryParamsToStr(queryParams)
    }

    @computed get baseUrl(): string | undefined {
        if (this.externalBaseUrl) return this.externalBaseUrl
        if (this.chart.isPublished)
            return `${BAKED_GRAPHER_URL}/${this.chart.data.slug}`
        else return undefined
    }

    @observable externalBaseUrl: string = ""
    @observable externallyProvidedParams: QueryParams = {}

    // Get the full url representing the canonical location of this chart state
    @computed get canonicalUrl(): string | undefined {
        return this.baseUrl ? this.baseUrl + this.queryStr : undefined
    }

    @computed get yearParam(): string | undefined {
        const { chart, origChartProps } = this

        if (
            chart.map &&
            origChartProps.map &&
            chart.map.targetYear !== origChartProps.map.targetYear
        ) {
            return formatTimeURIComponent(
                chart.map.targetYear,
                !!chart.yearIsDayVar
            )
        } else {
            return undefined
        }
    }

    @computed get timeParam(): string | undefined {
        const { chart, origChartProps } = this

        if (
            chart.props.minTime !== origChartProps.minTime ||
            chart.props.maxTime !== origChartProps.maxTime
        ) {
            const [minTime, maxTime] = chart.timeDomain
            if (minTime === maxTime)
                return formatTimeURIComponent(minTime, !!chart.yearIsDayVar)
            // It's not possible to have an unbounded right minTime or an unbounded left maxTime,
            // because minTime <= maxTime and because the === case is addressed above.
            // So the direction of the unbounded is unambiguous, and we can format it as an empty
            // string.
            const start = isUnbounded(minTime)
                ? ""
                : formatTimeURIComponent(minTime, !!chart.yearIsDayVar)
            const end = isUnbounded(maxTime)
                ? ""
                : formatTimeURIComponent(maxTime, !!chart.yearIsDayVar)
            return `${start}..${end}`
        } else {
            return undefined
        }
    }

    @computed get countryParam(): string | undefined {
        const { chart, origChartProps } = this
        if (
            chart.data.isReady &&
            JSON.stringify(chart.props.selectedData) !==
                JSON.stringify(origChartProps.selectedData)
        ) {
            return uniq(
                chart.data.selectedKeys
                    .map(k => chart.data.lookupKey(k).shortCode)
                    .map(encodeURIComponent)
            ).join("+")
        } else {
            return undefined
        }
    }

    /**
     * Set e.g. &shown=Africa when the user selects Africa on a stacked area chartView or other
     * toggle-based legend chartView.
     */
    /*updateLegendKeys() {
        var activeLegendKeys = chartView.model.get("activeLegendKeys");
        if (activeLegendKeys === null)
            setQueryVariable("shown", null);
        else {
            var keys = map(activeLegendKeys, function(key) {
                return encodeURIComponent(key);
            });
            setQueryVariable("shown", keys.join("+"));
        }
    }*/

    /**
     * Applies query parameters to the chart config
     */
    populateFromQueryParams(params: ChartQueryParams) {
        const { chart } = this

        // Set tab if specified
        const tab = params.tab
        if (tab) {
            if (!includes(chart.availableTabs, tab))
                console.error("Unexpected tab: " + tab)
            else chart.props.tab = tab as ChartTabOption
        }

        const overlay = params.overlay
        if (overlay) {
            if (!includes(chart.availableTabs, overlay))
                console.error("Unexpected overlay: " + overlay)
            else chart.props.overlay = overlay as ChartTabOption
        }

        // Stack mode for bar and stacked area charts
        chart.props.stackMode = defaultTo(
            params.stackMode,
            chart.props.stackMode
        )

        chart.props.zoomToSelection = defaultTo(
            params.zoomToSelection === "true" ? true : undefined,
            chart.props.zoomToSelection
        )

        // Axis scale mode
        const xScaleType = params.xScale
        if (xScaleType) {
            if (xScaleType === "linear" || xScaleType === "log")
                chart.xAxis.scaleType = xScaleType
            else console.error("Unexpected xScale: " + xScaleType)
        }

        const yScaleType = params.yScale
        if (yScaleType) {
            if (yScaleType === "linear" || yScaleType === "log")
                chart.yAxis.scaleType = yScaleType
            else console.error("Unexpected xScale: " + yScaleType)
        }

        const time = params.time
        if (time) {
            // We want to support unbounded time parameters, so that time=2015.. extends from 2015
            // to the latest year, and time=..2020 extends from earliest year to 2020. Also,
            // time=.. extends from the earliest to latest available year.
            const reIntComponent = new RegExp("\\-?\\d+")
            const reIntRange = new RegExp(
                `^(${reIntComponent.source})?\\.\\.(${reIntComponent.source})?$`
            )
            const reDateRange = new RegExp(
                `^(${reISODateComponent.source})?\\.\\.(${reISODateComponent.source})?$`
            )
            if (reIntRange.test(time) || reDateRange.test(time)) {
                const [start, end] = time.split("..")
                chart.timeDomain = [
                    parseTimeURIComponent(start, TimeBoundValue.unboundedLeft),
                    parseTimeURIComponent(end, TimeBoundValue.unboundedRight)
                ]
            } else {
                const t = parseTimeURIComponent(
                    time,
                    TimeBoundValue.unboundedRight
                )
                chart.timeDomain = [t, t]
            }
        }

        const endpointsOnly = params.endpointsOnly
        if (endpointsOnly !== undefined) {
            chart.props.compareEndPointsOnly =
                endpointsOnly === "1" ? true : undefined
        }

        // Map stuff below

        if (chart.props.map) {
            if (params.year) {
                const year = parseTimeURIComponent(
                    params.year,
                    TimeBoundValue.unboundedRight
                )
                chart.props.map.targetYear = year
            }

            const region = params.region
            if (region !== undefined) {
                chart.props.map.projection = region as MapProjection
            }
        }

        // Selected countries -- we can't actually look these up until we have the data
        const country = params.country
        when(
            () => chart.data.isReady,
            () => {
                runInAction(() => {
                    if (country) {
                        const entityCodes = country
                            .split("+")
                            .map(decodeURIComponent)
                        this.chart.data.setSelectedEntitiesByCode(entityCodes)
                    }
                })
            }
        )

        // Set shown legend keys for chartViews with toggleable series
        /*var shown = params.shown;
         if (isString(shown)) {
             var keys = map(shown.split("+"), function(key) {
                 return decodeURIComponent(key);
             });

             chart.activeLegendKeys = keys
         }*/
    }
}
