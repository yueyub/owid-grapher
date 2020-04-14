import { observer } from "mobx-react"
import React from "react"
import { Bounds } from "./Bounds"
import ReactDOM from "react-dom"
import { ChartView } from "./ChartView"
import { EntitySelectorSidebar } from "./EntitySelector"
import { ChartConfig } from "./ChartConfig"
import { dashboardTempStub } from "./DashboardTempStub"

@observer
export class DashboardView extends React.Component<{
    chartBounds: Bounds
    chart: ChartConfig
}> {
    static bootstrap({
        containerNode,
        queryStr
    }: {
        containerNode: HTMLElement
        queryStr?: string
    }) {
        const rect = new Bounds(0, 0, 800, 800)
        const bounds = Bounds.fromRect(rect)
        return ReactDOM.render(
            <DashboardView
                chartBounds={bounds}
                chart={new ChartConfig(dashboardTempStub)}
            />,
            containerNode
        )
    }

    render() {
        return (
            <div className="dashboardContainer">
                <div className="dashboardSidebarContainer">
                    <EntitySelectorSidebar chart={this.props.chart} />
                </div>
                <div className="chartContainer">
                    <ChartView
                        chart={this.props.chart}
                        bounds={this.props.chartBounds}
                    />
                </div>
            </div>
        )
    }
}
