import React from "react"
import { FuzzySearch } from "charts/FuzzySearch"
import { observer } from "mobx-react"
import { CovidChartBuilder } from "./CovidChartBuilder"
import { action, computed, observable } from "mobx"
import { CountryOption } from "./CovidTypes"
import { sortBy } from "lodash"

@observer
export class CountryPicker extends React.Component<{
    chartBuilder: CovidChartBuilder
    toggleCountryCommand: (countryCode: string, value: boolean) => void
}> {
    @action.bound onChange(ev: React.FormEvent<HTMLInputElement>) {
        this.props.toggleCountryCommand(
            ev.currentTarget.value,
            ev.currentTarget.checked
        )
    }

    @computed get fuzzy(): FuzzySearch<CountryOption> {
        return new FuzzySearch(this.options, "name")
    }

    @computed get searchResults(): CountryOption[] {
        const results = this.searchInput
            ? this.fuzzy.search(this.searchInput)
            : this.options
        return sortBy(results, result => result.name)
    }

    @action.bound onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {}

    @computed get options() {
        return this.props.chartBuilder.countryOptions
    }

    @observable searchInput?: string
    searchField!: HTMLInputElement

    render() {
        return (
            <div>
                <input
                    type="search"
                    placeholder="Search..."
                    value={this.searchInput}
                    onInput={e => (this.searchInput = e.currentTarget.value)}
                    onKeyDown={this.onSearchKeyDown}
                    ref={e => (this.searchField = e as HTMLInputElement)}
                />
                <div className="CountrySearchResults">
                    {this.searchResults.map((option, index) => (
                        <div key={index}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={option.selected}
                                    onChange={this.onChange}
                                    value={option.code}
                                />
                                {option.name}
                            </label>
                        </div>
                    ))}
                </div>

                <div className="CountrySelectionControls">
                    <div
                        onClick={this.props.chartBuilder.clearSelectionCommand}
                    >
                        X Clear selection
                    </div>
                </div>
            </div>
        )
    }
}
