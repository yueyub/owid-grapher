import { computed } from "mobx"
import {
    includes,
    identity,
    extend,
    some,
    cloneDeep,
    find,
    sortBy,
    min,
    max,
    defaultTo,
    findClosest,
    formatMoment,
    uniq
} from "./Util"
import { ChartConfig } from "./ChartConfig"
import { StackedBarValue, StackedBarSeries } from "./StackedBarChart"
import { AxisSpec } from "./AxisSpec"
import { IChartTransform } from "./IChartTransform"
import { DimensionWithData } from "./DimensionWithData"
import { DataKey } from "./DataKey"
import { Colorizer, Colorable } from "./Colorizer"

// Responsible for translating chart configuration into the form
// of a discrete bar chart
export class StackedBarTransform implements IChartTransform {
    chart: ChartConfig

    constructor(chart: ChartConfig) {
        this.chart = chart
    }

    @computed get isValidConfig(): boolean {
        return some(this.chart.dimensions, d => d.property === "y")
    }

    @computed get failMessage(): string | undefined {
        const { filledDimensions } = this.chart.data
        if (!some(filledDimensions, d => d.property === "y"))
            return "Missing variable"
        else if (
            this.groupedData.length === 0 ||
            this.groupedData[0].values.length === 0
        )
            return "No matching data"
        else return undefined
    }

    @computed get primaryDimension(): DimensionWithData | undefined {
        return find(this.chart.data.filledDimensions, d => d.property === "y")
    }
    @computed get colorDimension(): DimensionWithData | undefined {
        return find(
            this.chart.data.filledDimensions,
            d => d.property === "color"
        )
    }

    @computed get targetMoment(): number {
        const maxMoment = this.chart.timeDomain[1]
        if (!this.primaryDimension) return 1900

        const { variable } = this.primaryDimension
        if (maxMoment !== undefined)
            return sortBy(variable.momentsUniq, moment =>
                Math.abs(moment - maxMoment)
            )[0]
        else return max(variable.momentsUniq) as number
    }

    @computed get timelineMoments(): number[] {
        if (this.primaryDimension === undefined) return []
        return this.primaryDimension.momentsUniq
    }

    @computed get minTimelineMoment(): number {
        return defaultTo(min(this.timelineMoments), 1900)
    }

    @computed get maxTimelineMoment(): number {
        return defaultTo(max(this.timelineMoments), 2000)
    }

    @computed get startMoment(): number {
        const minMoment = defaultTo(
            this.chart.timeDomain[0],
            this.minTimelineMoment
        )
        return defaultTo(
            findClosest(this.timelineMoments, minMoment),
            this.minTimelineMoment
        )
    }

    @computed get endMoment(): number {
        const maxMoment = defaultTo(
            this.chart.timeDomain[1],
            this.maxTimelineMoment
        )
        return defaultTo(
            findClosest(this.timelineMoments, maxMoment),
            this.maxTimelineMoment
        )
    }

    @computed get barValueFormat(): (datum: StackedBarValue) => string {
        return (datum: StackedBarValue) => {
            return datum.y.toString()
        }
    }

    @computed get tickFormat(): (d: number) => string {
        const { primaryDimension } = this
        return primaryDimension
            ? primaryDimension.formatValueShort
            : (d: number) => `${d}`
    }

    @computed get yFormatTooltip(): (d: number) => string {
        const { primaryDimension, yTickFormat } = this

        return primaryDimension ? primaryDimension.formatValueLong : yTickFormat
    }

    // @computed get xFormatTooltip(): (d: number) => string {
    //     return !this.xDimension ? this.xAxis.tickFormat : this.xDimension.formatValueLong
    // }

    @computed get xDomainDefault(): [number, number] {
        return [this.startMoment, this.endMoment]
    }

    // TODO: Make XAxis generic
    @computed get xAxisSpec(): AxisSpec {
        const { chart, xDomainDefault } = this
        return extend(chart.xAxis.toSpec({ defaultDomain: xDomainDefault }), {
            tickFormat: (moment: number) => formatMoment(moment),
            hideFractionalTicks: true,
            hideGridlines: true
        }) as AxisSpec
    }

    @computed get yDomainDefault(): [number, number] {
        const lastSeries = this.stackedData[this.stackedData.length - 1]

        const yValues = lastSeries.values.map(d => d.yOffset + d.y)
        return [0, defaultTo(max(yValues), 100)]
    }

    @computed get yDimensionFirst() {
        return find(this.chart.data.filledDimensions, d => d.property === "y")
    }

    @computed get yTickFormat() {
        const { yDimensionFirst } = this

        return yDimensionFirst ? yDimensionFirst.formatValueShort : identity
    }

    @computed get yAxisSpec(): AxisSpec {
        const { chart, yDomainDefault, yTickFormat } = this

        return extend(chart.yAxis.toSpec({ defaultDomain: yDomainDefault }), {
            domain: [yDomainDefault[0], yDomainDefault[1]], // Stacked chart must have its own y domain
            tickFormat: yTickFormat
        }) as AxisSpec
    }

    @computed get allStackedValues(): StackedBarValue[] {
        const allValues: StackedBarValue[] = []
        this.stackedData.forEach(series => allValues.push(...series.values))
        return allValues
    }

    @computed get xValues(): number[] {
        return uniq(this.allStackedValues.map(bar => bar.x))
    }

    @computed get groupedData(): StackedBarSeries[] {
        const { chart, timelineMoments } = this
        const { filledDimensions, selectedKeys, selectedKeysByKey } = chart.data

        let groupedData: StackedBarSeries[] = []

        filledDimensions.forEach((dimension, dimIndex) => {
            const seriesByKey = new Map<DataKey, StackedBarSeries>()

            for (let i = 0; i <= dimension.moments.length; i += 1) {
                const moment = dimension.moments[i]
                const entity = dimension.entities[i]
                const value = +dimension.values[i]
                const datakey = chart.data.keyFor(entity, dimIndex)
                let series = seriesByKey.get(datakey)

                // Not a selected key, don't add any data for it
                if (!selectedKeysByKey[datakey]) continue
                // Must be numeric
                if (isNaN(value)) continue
                // Stacked bar chart can't go negative!
                if (value < 0) continue
                // only consider moments that are part of timeline to line up the bars
                if (!includes(timelineMoments, moment)) continue

                if (!series) {
                    series = {
                        key: datakey,
                        label: chart.data.formatKey(datakey),
                        values: [],
                        color: "#fff" // Temp
                    }
                    seriesByKey.set(datakey, series)
                }
                series.values.push({
                    x: moment,
                    y: value,
                    yOffset: 0,
                    isFake: false,
                    label: series.label
                })
            }

            groupedData = groupedData.concat([
                ...Array.from(seriesByKey.values())
            ])
        })

        // Now ensure that every series has a value entry for every moment in the data
        groupedData.forEach(series => {
            let i = 0

            while (i < timelineMoments.length) {
                const value = series.values[i] as StackedBarValue | undefined
                const expectedMoment = timelineMoments[i]

                if (value === undefined || value.x > timelineMoments[i]) {
                    // console.log("series " + series.key + " needs fake bar for " + expectedMoment)

                    const fakeY = 0
                    series.values.splice(i, 0, {
                        x: expectedMoment,
                        y: fakeY,
                        yOffset: 0,
                        isFake: true,
                        label: series.label
                    })
                }
                i += 1
            }
        })

        // Preserve order
        groupedData = sortBy(
            groupedData,
            series => -selectedKeys.indexOf(series.key)
        )

        return groupedData
    }

    @computed get colorKeys(): string[] {
        return uniq(this.groupedData.map(d => d.key)).reverse()
    }

    @computed get colors(): Colorizer {
        const that = this
        return new Colorizer({
            get chart() {
                return that.chart
            },
            get defaultColorScheme() {
                return "stackedAreaDefault"
            },
            get keys() {
                return that.colorKeys
            },
            get labelFormat() {
                return (key: string) => that.chart.data.formatKey(key)
            },
            invert: true
        })
    }

    @computed get colorables(): Colorable[] {
        return this.colors.colorables
    }

    // Apply time filtering and stacking
    @computed get stackedData(): StackedBarSeries[] {
        const { groupedData, startMoment, endMoment: endMoment } = this

        const stackedData = cloneDeep(groupedData)

        for (const series of stackedData) {
            series.color = this.colors.get(series.key)
            series.values = series.values.filter(
                v => v.x >= startMoment && v.x <= endMoment
            )
        }

        // every subsequent series needs be stacked on top of previous series
        for (let i = 1; i < stackedData.length; i++) {
            for (let j = 0; j < stackedData[0].values.length; j++) {
                stackedData[i].values[j].yOffset =
                    stackedData[i - 1].values[j].y +
                    stackedData[i - 1].values[j].yOffset
            }
        }

        // if the total height of any stacked column is 0, remove it
        const keyIndicesToRemove: number[] = []
        const lastSeries = stackedData[stackedData.length - 1]
        lastSeries.values.forEach((bar, index) => {
            if (bar.yOffset + bar.y === 0) {
                keyIndicesToRemove.push(index)
            }
        })
        for (let i = keyIndicesToRemove.length - 1; i >= 0; i--) {
            stackedData.forEach(series => {
                series.values.splice(keyIndicesToRemove[i], 1)
            })
        }

        return stackedData
    }
}
