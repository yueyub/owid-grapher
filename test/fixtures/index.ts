import * as fs from "fs"

import { Indicator } from "charts/Indicator"
import { ChartConfigProps } from "charts/ChartConfig"
import { OwidVariableSet } from "charts/owidData/OwidVariableSet"
import { Post } from "db/model/Post"
import { RelatedChart } from "site/client/blocks/RelatedCharts/RelatedCharts"

export function readBuffer(fixture: string) {
    return fs.readFileSync(__dirname + `/${fixture}.json`)
}

function readObj(fixture: string) {
    return JSON.parse(readBuffer(fixture).toString())
}

export function readVariable(id: string | number): OwidVariableSet {
    return readObj(`variable-${id}`)
}

export function readChart(id: string | number): ChartConfigProps {
    return readObj(`chart-${id}`)
}

export function readIndicators(): { indicators: Indicator[] } {
    return readObj("indicators")
}

export function readPost(id: number): Post.Row {
    return readObj(`post-row-${id}`)
}

export function readChartsPost(id: number): RelatedChart[] {
    return readObj(`charts-post-${id}`)
}
