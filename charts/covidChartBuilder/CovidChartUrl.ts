import { computed, observable } from "mobx"

import { ObservableUrl } from "../UrlBinding"
import { ChartUrl } from "../ChartUrl"
import { QueryParams, strToQueryParams } from "utils/client/url"
import { extend } from "../Util"
import { CountOption, TimelineOption, SmoothingOption } from "./CovidTypes"

export class CovidQueryParams {
    @observable testsMetric: boolean = true
    @observable deathsMetric: boolean = true
    @observable casesMetric: boolean = true
    @observable totalFreq: boolean = true
    @observable dailyFreq: boolean = false
    @observable count: CountOption = "total"
    @observable timeline: TimelineOption = "normal"
    @observable smoothing: SmoothingOption = 0
    @observable selectedCountryCodes: Set<string> = new Set(["USA"])

    constructor(queryString: string) {
        const params = strToQueryParams(queryString)
        if (params.testsMetric) this.testsMetric = true
        if (params.deathsMetric) this.deathsMetric = true
        if (params.casesMetric) this.casesMetric = true
        if (params.totalFreq) this.totalFreq = true
        if (params.dailyFreq) this.dailyFreq = true
        if (params.count) this.count = params.count as CountOption
        if (params.timeline) this.timeline = params.timeline as TimelineOption
        if (params.smoothing)
            this.smoothing = parseInt(params.smoothing) as SmoothingOption
        if (params.country)
            this.selectedCountryCodes = new Set(params.country.split("+"))
    }

    @computed get toParams(): QueryParams {
        const params: any = {}
        params.testsMetric = this.testsMetric ? true : undefined
        params.deathsMetric = this.deathsMetric ? true : undefined
        params.casesMetric = this.casesMetric ? true : undefined
        params.dailyFreq = this.dailyFreq ? true : undefined
        params.totalFreq = this.totalFreq ? true : undefined
        params.count = this.count

        if (this.selectedCountryCodes.values.length)
            params.selectedCountryCodes = Array.from(
                this.selectedCountryCodes
            ).join(",")
        return params as QueryParams
    }
}

export class CovidUrl implements ObservableUrl {
    chartUrl: ChartUrl
    covidQueryParams: CovidQueryParams

    constructor(chartUrl: ChartUrl, covidQueryParams: CovidQueryParams) {
        this.chartUrl = chartUrl
        this.covidQueryParams = covidQueryParams
    }

    @computed get params(): QueryParams {
        return extend({}, this.chartUrl.params, this.covidQueryParams.toParams)
    }

    @computed get debounceMode(): boolean {
        return this.chartUrl.debounceMode
    }

    // populateFromQueryStr(queryStr?: string) {
    //     if (queryStr === undefined) return
    //     this.populateFromQueryParams(strToQueryParams(queryStr))
    // }

    // populateFromQueryParams(params: ExploreQueryParams) {
    //     const { model } = this

    //     const chartType = params.type
    //     if (chartType) {
    //         model.chartType = chartType as ExplorerChartType
    //     }

    //     if (params.indicator) {
    //         const id = parseInt(params.indicator)
    //         model.indicatorId = isNaN(id) ? undefined : id
    //     }

    //     this.chartUrl.populateFromQueryParams(params)
    // }
}
