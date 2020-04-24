import { OwidVariableSet, OwidEntityKey } from "../owidData/OwidVariableSet"
import React from "react"
import ReactDOM from "react-dom"
import { ChartView } from "charts/ChartView"
import { Bounds } from "charts/Bounds"
import { ChartConfig } from "charts/ChartConfig"
import { computed, action, observable } from "mobx"
import { ChartTypeType } from "charts/ChartType"
import { observer } from "mobx-react"
import { OwidVariable } from "../owidData/OwidVariable"
import { uniqBy } from "lodash"
import { ChartDimension } from "../ChartDimension"
import * as urlBinding from "charts/UrlBinding"
import {
    TimelineOption,
    SmoothingOption,
    TotalFrequencyOption,
    CasesMetricOption,
    TestsMetricOption,
    DailyFrequencyOption,
    CountOption,
    DeathsMetricOption,
    MetricKind,
    ParsedCovidRow,
    CountryOption
} from "./CovidTypes"
import {
    RadioOption as InputOption,
    CovidRadioControl as CovidInputControl
} from "./CovidRadioControl"
import { CountryPicker } from "./CovidCountryPicker"
import { CovidQueryParams, CovidUrl } from "./CovidChartUrl"
import {
    fetchAndParseData,
    RowAccessor,
    buildCovidVariable,
    daysSinceVariable,
    continentsVariable
} from "./CovidData"
import { worldRegionByMapEntity, labelsByRegion } from "charts/WorldRegions"
import { variablePartials } from "./CovidVariablePartials"

// TODO: ensure ***FASTT*** stands for Footnote, Axis label, Subtitle, Title, Target unit
@observer
export class CovidChartBuilder extends React.Component<{
    data: ParsedCovidRow[]
    params: CovidQueryParams
}> {
    static async bootstrap() {
        const containerNode = document.getElementById("chartBuilder")
        const typedData = await fetchAndParseData()
        const defaultParams = new CovidQueryParams(window.location.search)
        ReactDOM.render(
            <CovidChartBuilder data={typedData} params={defaultParams} />,
            containerNode
        )
    }

    @computed private get deathsVariable(): OwidVariable {
        if (this.props.params.totalFreq)
            return this.buildVariable("deaths", row => row.total_deaths)
        return this.buildVariable("deaths", row => row.new_deaths)
    }

    @computed private get casesVariable(): OwidVariable {
        if (this.props.params.totalFreq)
            return this.buildVariable("cases", row => row.total_cases)
        return this.buildVariable("cases", row => row.new_cases)
    }

    @computed private get testsVariable(): OwidVariable {
        if (this.props.params.totalFreq)
            return this.buildVariable("tests", row => row.total_tests)
        return this.buildVariable("tests", row => row.new_tests)
    }

    buildVariable(name: MetricKind, rowFn: RowAccessor) {
        const perCapita =
            this.props.params.count === "total"
                ? undefined
                : this.props.params.testsMetric
                ? 1000
                : 1000000
        return buildCovidVariable(
            name,
            this.countryMap,
            this.props.data,
            rowFn,
            perCapita,
            this.props.params.smoothing === "threeDayRollingAverage" ? 3 : 0
        )
    }

    @action.bound setDeathsMetricCommand(value: DeathsMetricOption) {
        this.props.params.deathsMetric = value
        this.updateChart()
    }

    @action.bound clearSelectionCommand() {
        this.props.params.selectedCountryCodes.clear()
        this.updateChart()
    }

    // todo: perf
    @action.bound selectAllCommand() {
        this.countryOptions.forEach(country => {
            this.toggleSelectedCountryCommand(country.code, true)
        })
        this.updateChart()
    }

    @action.bound setCasesMetricCommand(value: CasesMetricOption) {
        this.props.params.casesMetric = value
        this.updateChart()
    }

    @action.bound setTestsMetricCommand(value: TestsMetricOption) {
        this.props.params.testsMetric = value
        this.updateChart()
    }

    setTotalFrequencyCommand(option: TotalFrequencyOption) {
        this.props.params.totalFreq = option
        this.updateChart()
    }

    setDailyFrequencyCommand(option: DailyFrequencyOption) {
        this.props.params.dailyFreq = option
        this.updateChart()
    }

    @action.bound setCountCommand(countOption: CountOption) {
        this.props.params.count = countOption
        this.updateChart()
    }

    setSmoothingCommand(option: SmoothingOption) {
        this.props.params.smoothing = option
        this.updateChart()
    }

    setTimelineCommand(option: TimelineOption) {
        this.props.params.timeline = option
        this.updateChart()
    }

    private get metricPicker() {
        const options: InputOption[] = [
            {
                label: "Confirmed Deaths",
                checked: this.props.params.deathsMetric,
                onChange: value => {
                    this.setDeathsMetricCommand(value)
                }
            },
            {
                label: "Confirmed Cases",
                checked: this.props.params.casesMetric,
                onChange: value => {
                    this.setCasesMetricCommand(value)
                }
            },
            {
                label: "Tests",
                checked: this.props.params.testsMetric,
                onChange: value => {
                    this.setTestsMetricCommand(value)
                }
            }
        ]
        return (
            <CovidInputControl
                name="metric"
                options={options}
                isCheckbox={true}
            ></CovidInputControl>
        )
    }

    private get frequencyPicker() {
        const options: InputOption[] = [
            {
                label: "Total",
                checked: this.props.params.totalFreq,
                onChange: value => {
                    this.setTotalFrequencyCommand(value)
                }
            },
            {
                label: "Daily",
                checked: this.props.params.dailyFreq,
                onChange: value => {
                    this.setDailyFrequencyCommand(value)
                }
            }
        ]
        return (
            <CovidInputControl
                name="frequency"
                options={options}
                isCheckbox={true}
            ></CovidInputControl>
        )
    }

    @computed private get countPicker() {
        const options: InputOption[] = [
            {
                label: "Total counts",
                checked: this.props.params.count === "total",
                onChange: () => {
                    this.setCountCommand("total")
                }
            },
            {
                label: "Per capita statistics",
                checked: this.props.params.count === "perCapita",
                onChange: () => {
                    this.setCountCommand("perCapita")
                }
            }
        ]
        return (
            <CovidInputControl
                name="count"
                options={options}
            ></CovidInputControl>
        )
    }

    private get timelinePicker() {
        const options: InputOption[] = [
            {
                label: "Normal timeline",
                checked: this.props.params.timeline === "normal",
                onChange: () => {
                    this.setTimelineCommand("normal")
                }
            },
            {
                label: "Align with the first 5 deaths",
                checked: this.props.params.timeline === "alignFirstFiveDeaths",
                onChange: () => {
                    this.setTimelineCommand("alignFirstFiveDeaths")
                }
            }
        ]
        return (
            <CovidInputControl
                name="timeline"
                options={options}
            ></CovidInputControl>
        )
    }

    private get smoothingPicker() {
        const options: InputOption[] = [
            {
                label: "Normal",
                checked: this.props.params.smoothing === "normal",
                onChange: () => {
                    this.setSmoothingCommand("normal")
                }
            },
            {
                label: "3 Day Rolling Average",
                checked:
                    this.props.params.smoothing === "threeDayRollingAverage",
                onChange: () => {
                    this.setSmoothingCommand("threeDayRollingAverage")
                }
            }
        ]
        return (
            <CovidInputControl
                name="smoothing"
                options={options}
            ></CovidInputControl>
        )
    }

    @action.bound toggleSelectedCountryCommand(code: string, value?: boolean) {
        if (value) this.props.params.selectedCountryCodes.add(code)
        else if (value === false)
            this.props.params.selectedCountryCodes.delete(code)
        else if (this.props.params.selectedCountryCodes.has(code))
            this.props.params.selectedCountryCodes.delete(code)
        else this.props.params.selectedCountryCodes.add(code)

        // this.chart.data.setSelectedEntity(this.countryCodeMap.get(code))

        this.updateChart()
    }

    render() {
        const bounds = new Bounds(0, 0, 840, 600)

        return (
            <div className="CovidChartBuilder">
                <div className="CovidChartBuilderSideBar">
                    <CountryPicker
                        chartBuilder={this}
                        toggleCountryCommand={this.toggleSelectedCountryCommand}
                    ></CountryPicker>
                </div>
                <div className="CovidChartBuilderMainBar">
                    <div className="CovidChartBuilderTopBar">
                        {this.metricPicker}
                        {this.frequencyPicker}
                        {this.countPicker}
                        {this.timelinePicker}
                        {this.smoothingPicker}
                    </div>
                    <div className="CovidChartBuilderFigure">
                        <ChartView
                            bounds={bounds}
                            chart={this.chart}
                        ></ChartView>
                    </div>
                </div>
            </div>
        )
    }

    @computed get countryOptions(): CountryOption[] {
        const countries = uniqBy(this.props.data, "iso_code")
        return countries.map(country => {
            return {
                name: country.location,
                selected: this.props.params.selectedCountryCodes.has(
                    country.iso_code
                ),
                slug: country.location,
                code: country.iso_code,
                continent:
                    labelsByRegion[worldRegionByMapEntity[country.location]]
            }
        })
    }

    @computed private get availableEntities() {
        return this.countryOptions.map(country => country.name)
    }

    @computed get frequencyTitle() {
        if (this.props.params.dailyFreq && this.props.params.totalFreq)
            return "Total and daily"
        else if (this.props.params.dailyFreq) return "Daily"
        return "Total"
    }

    @computed get countTitle() {
        const { params } = this.props
        if (params.testsMetric && params.count === "perCapita")
            return " per thousand people"
        if (params.count === "perCapita") return " per million people"
        return ""
    }

    @computed get metricTitle() {
        const metrics = []
        if (this.props.params.deathsMetric) metrics.push("deaths")
        if (this.props.params.casesMetric) metrics.push("cases")
        if (this.props.params.testsMetric) metrics.push("tests")
        return metrics.length === 3
            ? "deaths, cases and tests"
            : metrics.length === 2
            ? `${metrics[0]} and ${metrics[1]}`
            : metrics[0]
    }

    @computed get smoothingTitle() {
        if (this.props.params.smoothing === "threeDayRollingAverage")
            return ", rolling 3-day average"
        return ""
    }

    @computed get title() {
        return `${this.frequencyTitle} COVID-19 ${this.metricTitle}${this.countTitle}${this.smoothingTitle}`
    }

    @computed get note() {
        if (this.props.params.testsMetric)
            return "Note: For testing figures, there are substantial differences across countries in terms of the units, whether or not all labs are included, the extent to which negative and pending tests are included and other aspects. Details for each country can be found at the linked page."
        return ""
    }

    @computed get selectedData() {
        const countryCodeMap = this.countryCodeMap
        return Array.from(this.props.params.selectedCountryCodes).map(code => {
            return {
                index: 0,
                entityId: countryCodeMap.get(code)
            }
        })
    }

    @computed get countryMap() {
        const map = new Map<string, number>()
        this.countryOptions.forEach((country, index) => {
            map.set(country.name, index)
        })
        return map
    }

    @computed get countryCodeMap() {
        const map = new Map<string, number>()
        this.countryOptions.forEach((country, index) => {
            map.set(country.code, index)
        })
        return map
    }

    @computed get countryCodeToNameMap() {
        const map = new Map<string, string>()
        this.countryOptions.forEach((country, index) => {
            map.set(country.code, country.name)
        })
        return map
    }

    @computed get firstSelectedCountryName() {
        return this.countryCodeToNameMap.get(
            Array.from(this.props.params.selectedCountryCodes)[0]
        )
    }

    @computed get entityKey(): OwidEntityKey {
        const key: OwidEntityKey = {}
        this.countryOptions.forEach((country, index) => {
            key[index] = {
                name: country.name,
                code: country.code,
                id: index
            }
        })

        return key
    }

    // Todo: if someone selects "Align with the first N deaths", then we should switch to a scatterplot chart type.
    @computed get chartType(): ChartTypeType {
        return this.props.params.timeline === "normal"
            ? "LineChart"
            : "ScatterPlot"
    }

    // We are computing variables clientside so they don't have a variable index. The variable index is used by Chart
    // in a number of places, so we still need a unique one per variable. The way our system works, changing things like
    // frequency or per capita would be in effect creating a new variable. So we need to generate unique variable ids
    // for all of these combinations.
    @computed get yVariableIndices(): number[] {
        const params = this.props.params
        const indices = []

        const buildId = (id: number) =>
            id *
            (params.dailyFreq ? 3 : 1) *
            (params.count === "perCapita" ? 5 : 1) *
            (params.smoothing === "threeDayRollingAverage" ? 7 : 1)

        if (params.testsMetric) {
            const id = buildId(variablePartials.tests.id!)
            indices.push(id)
            this.owidVariableSet.variables[id] = this.testsVariable
        }

        if (params.casesMetric) {
            const id = buildId(variablePartials.cases.id!)
            indices.push(id)
            this.owidVariableSet.variables[id] = this.casesVariable
        }

        if (params.deathsMetric) {
            const id = buildId(variablePartials.deaths.id!)
            indices.push(id)
            this.owidVariableSet.variables[id] = this.deathsVariable
        }

        return indices
    }

    @observable.struct owidVariableSet: OwidVariableSet = {
        variables: {
            99999: daysSinceVariable(this.props.data, this.countryMap),
            123: continentsVariable(this.countryOptions)
        },
        entityKey: this.entityKey
    }

    private continentsVariableId = variablePartials.continents.id!

    updateChart() {
        // We can't create a new chart object with every radio change because the Chart component itself
        // maintains state (for example, which tab is currently active). Temporary workaround is just to
        // manually update the chart when the chart builderselections change.
        // todo: cleanup
        const chartProps = this.chart.props
        chartProps.title = this.title
        chartProps.note = this.note
        chartProps.type = this.chartType
        chartProps.owidDataset = this.owidVariableSet

        chartProps.dimensions = this.dimensions
        chartProps.map.variableId = this.yVariableIndices[0]
        chartProps.data!.availableEntities = this.availableEntities

        if (this.addCountryMode === "change-country") {
            const keys = this.chart.data.availableKeysByEntity.get(
                this.firstSelectedCountryName
            )
            if (keys && keys.length) {
                this.chart.data.selectedKeys = keys
            }
        } else {
            chartProps.selectedData = this.selectedData
        }

        chartProps.addCountryMode = this.addCountryMode

        // this.chart.url.externalBaseUrl = "covid-chart-builder"
        // this.chart.url.externallyProvidedParams = this.props.params.toParams
    }

    componentDidMount() {
        this.bindToWindow()
        this.updateChart()
    }

    bindToWindow() {
        const url = new CovidUrl(this.chart.url, this.props.params)
        urlBinding.bindUrlToWindow(url)
    }

    @computed get dimensions(): ChartDimension[] {
        if (this.chartType === "LineChart")
            return this.yVariableIndices.map(id => {
                return {
                    property: "y",
                    variableId: id,
                    display: {}
                }
            })

        return [
            {
                property: "y",
                variableId: this.yVariableIndices[0],
                display: {}
            },
            {
                property: "x",
                variableId: 99999,
                display: {
                    name: "Days since the 5th total confirmed death"
                }
            },
            {
                property: "color",
                variableId: this.continentsVariableId,
                display: {}
            }
        ]
    }

    @computed get areMultipleMetricsSelected() {
        const params = this.props.params
        return (
            (params.casesMetric ? 1 : 0) +
                (params.deathsMetric ? 1 : 0) +
                (params.testsMetric ? 1 : 0) >
            1
        )
    }

    @computed get addCountryMode():
        | "change-country"
        | "add-country"
        | "disabled" {
        return this.areMultipleMetricsSelected
            ? "change-country"
            : "add-country"
    }

    @observable.ref chart = new ChartConfig(
        {
            slug: "covid-chart-builder",
            type: this.chartType,
            isExplorable: false,
            id: 4128,
            version: 9,
            title: this.title,
            note: this.note,
            hideTitleAnnotation: true,
            xAxis: {
                scaleType: "linear"
            },
            yAxis: {
                min: 0,
                scaleType: "linear",
                canChangeScaleType: true
            },
            owidDataset: this.owidVariableSet,
            selectedData: this.selectedData,
            dimensions: this.dimensions,
            addCountryMode: this.addCountryMode,
            stackMode: "absolute",
            hideRelativeToggle: true,
            hasChartTab: true,
            hasMapTab: true,
            tab: "chart",
            isPublished: true,
            map: {
                variableId: this.yVariableIndices[0],
                targetYear: 85,
                colorSchemeValues: [],
                colorSchemeLabels: [],
                customNumericColors: [],
                customCategoryColors: {},
                customCategoryLabels: {},
                customHiddenCategories: {},
                projection: "World"
            },
            data: {
                availableEntities: this.availableEntities
            }
        },
        {
            queryStr: window.location.search
        }
    )
}
