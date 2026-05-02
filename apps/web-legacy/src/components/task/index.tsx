'use client'
import ReactEcharts from 'echarts-for-react';
import {EChartsOption} from "echarts";
import {useRouter} from "next/navigation";
import Loading from "@/components/Loading";
import useTaskCharts from "@/hooks/useTaskCharts";
import {useState} from "react";
import {convertToEC4StyleForCustomSerise} from "echarts/types/src/util/styleCompat";

function TaskManageNoteEditChart(props: {
    noteTaskId: number
}) {

    const {noteTaskId} = props
    const {data, isLoading, error} = useTaskCharts(noteTaskId)
    const router = useRouter()
    const chartData: any = useState({
        segments: [],
        hourArray: [],
        data: []
    })

    if (isLoading) {
        return (
            <div className="w-full h-[300px]">
                <Loading/>
            </div>
        )
    } else {
        chartData.hourArray = []
        let maxEditCount = -1

        if (data) {
            data.forEach((entry: any) => {
                entry.chartsPOList.forEach((item: any) => {
                    if (item.editCount > maxEditCount) {
                        maxEditCount = item.editCount;
                    }
                });
            });
        }
        const segmentCount = 5;
        const segmentInterval = maxEditCount > 500 ? 50 : Math.floor(maxEditCount / segmentCount);

        chartData.segments = []
        for (let i = 1; i <= segmentCount; i++) {
            const start = (i - 1) * segmentInterval;
            const end = i * segmentInterval;
            chartData.segments.push({start, end});

            if (i == segmentCount && maxEditCount > 500) chartData.segments.push({start:end,end:maxEditCount});
        }

        chartData.data = []
        data?.forEach((item: any) => {
            if (item.chartsPOList.length > 0) {
                chartData.hourArray.push(item.startTime)

                item.chartsPOList.forEach((student: any) => {
                    const entry = [chartData.hourArray.findIndex((time: any) => {
                        return time == item.startTime
                    }), student.editCount > 500 ? 5 : Math.floor(student.editCount / segmentInterval), [student]]

                    const entryIndex = chartData.data.findIndex((item: any) => {
                        return item[0] == entry[0] && item[1] == entry[1]
                    })

                    if (entryIndex != -1) {
                        const students: any = chartData.data[entryIndex][2]
                        students[students.length] = student
                        chartData.data[entryIndex] = [chartData.hourArray.findIndex((time: any) => {
                            return time == item.startTime
                        }), student.editCount > 500 ? 6 :  Math.floor(student.editCount / segmentInterval), students]
                    } else {
                        chartData.data.push(entry)
                    }
                })
            }
        })
    }

    const option: EChartsOption = {
        tooltip: {
            position: 'top',
            trigger: 'item',
            confine:true,
            formatter: function (params) {
                const students = chartData.data.find(item => {
                    return item[0] == params.data[0] && item[1] == params.data[1]
                })[2]
                let html = '统计人数: <br>'

                students.forEach((item, index) => {
                    html += '姓名：' + item.nickname + ' , 编辑次数：' + item.editCount + '<br>'
                })
                return html
            }
        },
        grid: {
            height: '50%',
            top: '10%'
        },
        xAxis: {
            type: 'category',
            data: chartData.hourArray.map(item => {
                const date = new Date(item)
                return date.getMonth() + '/' + date.getDate() + ' ' + date.getHours() + '时'
            }),
            splitArea: {
                show: true
            }
        },
        yAxis: {
            type: 'category',
            data: chartData.segments.map(item => {
                return item.start + " - " + item.end + ' 次'
            }),
            splitArea: {
                show: true
            }
        },
        visualMap: {
            min: 0,
            max: 10,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '15%'
        },
        series: [
            {
                name: 'Punch Card',
                type: 'heatmap',
                data: chartData.data.map((item) => {
                    return [item[0], item[1], item[2].length]
                }),
                label: {
                    show: true,
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }
        ]
    }

    const onChartClick = (params: any) => {
        if (data) {
            router.push(`/note/${data[params.dataIndex].noteId}`)
        }
    }


    return (
        <div>

            <ReactEcharts
                // onEvents={{
                //     click: onChartClick
                // }}
                option={option}
            />

        </div>
    )
}


export default TaskManageNoteEditChart
