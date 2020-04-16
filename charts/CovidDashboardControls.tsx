import React from "react"
import { observer } from "mobx-react"
import { ChartConfig, ChartConfigProps } from "./ChartConfig"
import { observable, computed, action } from "mobx"
import { EntityDimensionInfo } from "./ChartData"
import { FuzzySearch } from "./FuzzySearch"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes"
import { EntityDimensionKey } from "./EntityDimensionKey"
import ReactDOM from "react-dom"

export interface PatchOption {
    label: string
    onSelect: () => void
}

@observer
export class PatchChartControl extends React.Component<{
    chart: ChartConfig
    patchOptions: PatchOption[]
}> {
    @action.bound onChange(ev: React.ChangeEvent<HTMLInputElement>) {
        this.props.patchOptions[parseInt(ev.currentTarget.value)].onSelect()
    }

    render() {
        return (
            <div className="dashboardRadio">
                {this.props.patchOptions.map((option, index) => (
                    <div key={index}>
                        <label>
                            <input
                                onChange={this.onChange}
                                type="radio"
                                name="transform"
                                value={index}
                            />{" "}
                            {option.label}
                        </label>
                    </div>
                ))}
            </div>
        )
    }
}

@observer
export class CountrySelectorSidebar extends React.Component<{
    chart: ChartConfig
}> {
    @observable searchInput?: string
    searchField!: HTMLInputElement

    @computed get availableEntities(): EntityDimensionInfo[] {
        return this.props.chart.activeTransform.selectableEntityDimensionKeys.map(
            key => this.props.chart.data.lookupKey(key)
        )
    }

    @computed get selectedEntities() {
        return this.availableEntities.filter(d =>
            this.isSelectedKey(d.entityDimensionKey)
        )
    }

    @computed get fuzzy(): FuzzySearch<EntityDimensionInfo> {
        return new FuzzySearch(this.availableEntities, "label")
    }

    @computed get searchResults(): EntityDimensionInfo[] {
        return this.searchInput
            ? this.fuzzy.search(this.searchInput)
            : this.availableEntities
    }

    isSelectedKey(entityDimensionKey: EntityDimensionKey): boolean {
        return !!this.props.chart.data.selectedKeysByKey[entityDimensionKey]
    }

    @action.bound onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" && this.searchResults.length > 0) {
            this.props.chart.data.toggleKey(
                this.searchResults[0].entityDimensionKey
            )
            this.searchInput = ""
        }
    }

    @action.bound onClear() {
        this.props.chart.data.selectedKeys = []
    }

    render() {
        const { chart } = this.props
        const {
            selectedEntities: selectedData,
            searchResults,
            searchInput
        } = this

        return (
            <div className="entitySelectorOverlay">
                <div className="EntitySelectorMulti">
                    <div className="entities wrapper">
                        <div className="searchResults">
                            <input
                                type="search"
                                placeholder="Search..."
                                value={searchInput}
                                onInput={e =>
                                    (this.searchInput = e.currentTarget.value)
                                }
                                onKeyDown={this.onSearchKeyDown}
                                ref={e =>
                                    (this.searchField = e as HTMLInputElement)
                                }
                            />
                            <ul>
                                {searchResults.map(d => {
                                    return (
                                        <li key={d.entityDimensionKey}>
                                            <label className="clickable">
                                                <input
                                                    type="checkbox"
                                                    checked={this.isSelectedKey(
                                                        d.entityDimensionKey
                                                    )}
                                                    onChange={() =>
                                                        chart.data.toggleKey(
                                                            d.entityDimensionKey
                                                        )
                                                    }
                                                />{" "}
                                                {d.label}
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                        <div className="selectedData">
                            <ul>
                                {selectedData.map(d => {
                                    return (
                                        <li key={d.entityDimensionKey}>
                                            <label className="clickable">
                                                <input
                                                    type="checkbox"
                                                    checked={this.isSelectedKey(
                                                        d.entityDimensionKey
                                                    )}
                                                    onChange={() =>
                                                        chart.data.toggleKey(
                                                            d.entityDimensionKey
                                                        )
                                                    }
                                                />{" "}
                                                {d.label}
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                            {selectedData && selectedData.length > 1 ? (
                                <button
                                    className="clearSelection"
                                    onClick={this.onClear}
                                >
                                    <span className="icon">
                                        <FontAwesomeIcon icon={faTimes} />
                                    </span>{" "}
                                    Unselect all
                                </button>
                            ) : (
                                undefined
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

export const renderCoronaDashboard = (chart: ChartConfig) => {
    const sidebarContainerNode = document.getElementsByClassName(
        "DashboardChartSideBar"
    )[0]
    ReactDOM.render(
        <CountrySelectorSidebar chart={chart} />,
        sidebarContainerNode
    )

    const topContainerNode = document.getElementsByClassName(
        "DashboardChartTopBar"
    )[0]

    const options: PatchOption[] = [
        {
            label: "Total counts",
            onSelect: () => {
                const patch: Partial<ChartConfigProps> = {
                    title: "Total confirmed COVID-19 deaths",
                    dimensions: [
                        {
                            property: "y",
                            variableId: 142583,
                            display: {
                                unit: "deaths",
                                numDecimalPlaces: 0
                            }
                        }
                    ]
                }
                chart.props.title = patch.title
                chart.props.dimensions = patch.dimensions!
                chart.props.map.variableId = 142583
            }
        },
        {
            label: "Per capita statistics",
            onSelect: () => {
                const patch: Partial<ChartConfigProps> = {
                    title: "Total confirmed COVID-19 deaths per million people",
                    dimensions: [
                        {
                            property: "y",
                            variableId: 142587,
                            display: {}
                        }
                    ]
                }
                chart.props.title = patch.title
                chart.props.dimensions = patch.dimensions!
                chart.props.map.variableId = 142587
            }
        }
    ]

    ReactDOM.render(
        <PatchChartControl chart={chart} patchOptions={options} />,
        topContainerNode
    )
}
