"use client"

import React from "react";
import {Card, Form, Progress, Tag} from "antd";
import Meta from "antd/es/card/Meta";
import FormItem from "antd/es/form/FormItem";
import DateTimeFormatter from "@/utils/date";
import {useRouter} from "next/navigation";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import { NoteTask } from "@/types/noteTypes";
import MarkDownViewer from "@/components/MarkDownViewer";

interface TaskItemCardProps {
    data: NoteTask
}

const TaskItemCard: React.FC<TaskItemCardProps> = ({data}) => {

    const router = useRouter();

    return (
        <div className="mr-6 mt-3">
            <Card
                hoverable
            >
                <Meta title={data.taskName}
                      description={
                          <Form>
                              <FormItem label={'任务状态'}>
                                  {/*{item.status == 0 ? (*/}
                                  {/*    <Tag color="#87d068">进行中</Tag>) : (*/}
                                  {/*    <Tag color="#f50">已结束</Tag>)}*/}
                                  {new Date(data.endTime) > new Date() ? (
                                      <Tag color="#87d068">进行中</Tag>) : (
                                      <Tag color="#f50">已结束</Tag>)}
                              </FormItem>
                              <FormItem label={'起止时间'}>
                                  <div>{DateTimeFormatter.formatDate(data.startTime)} 至 {DateTimeFormatter.formatDate(data.endTime)}</div>
                              </FormItem>

                              <FormItem label={'发布人'}>
                                  <div>{data.taskCreatorNickname}</div>
                              </FormItem>
                              <FormItem label={'提交状态'}>
                                  <div>{data.submissionStatus == 0 ? (
                                      <Tag bordered={false}
                                           color="processing">未提交</Tag>) : data.submissionStatus == 1 ? (
                                      <Tag bordered={false}
                                           color="success">已提交</Tag>) : data.submissionStatus == 2 ?
                                      <Tag bordered={false} color="success">无需提交</Tag> :
                                      <Tag bordered={false}
                                           color="error">被退回</Tag>}</div>
                              </FormItem>
                              {data?.taskDescribe ?
                                  <FormItem>
                                      <div className="flex flex-col">
                                          <div className="text-base mb-1">任务描述：</div>
                                          <MarkDownViewer content={data.taskDescribe}/>
                                      </div>
                                  </FormItem>
                                  : <></>
                              }
                          </Form>}
                />
            </Card>
        </div>
    )
}

export default withThemeConfigProvider(TaskItemCard)
