'use client'

import type { CSSProperties } from 'react';
import React, { useEffect, useState } from 'react';
import { CaretRightOutlined } from '@ant-design/icons';
import { Button, Card, CollapseProps } from 'antd';
import { Collapse, theme } from 'antd';
import Title from "@/components/Title";
import { SWRResponse } from "swr";
import { PageBean } from "@/types/requestTypes";
import Loading from "@/components/Loading";
import useMoocItem from "@/hooks/mooc/useMoocItem";
import useMoocItemList from "@/hooks/mooc/useMoocItemList";
import { getMoocItemList } from "@/requests/client/note/mooc";

interface TreeNode {
    title: string;
    key: string;
    nodeId: number;
    children?: TreeNode[];
    moocItemType?: number;
    objectName?: string;
    parentId?: number;
    isLeaf?: boolean;
}

const getItems = (panelStyle: React.CSSProperties, treeData: TreeNode[], onExpand: (key: string | string[]) => void): CollapseProps['items'] => {
    const processNode = (node: TreeNode, index: number): NonNullable<CollapseProps['items']>[number] => {
        const item: NonNullable<CollapseProps['items']>[number] = {
            key: node.key,
            label: <div className="flex items-center gap-2">
                <span>{node.key}</span>
                <span>{node.title}</span>
            </div>,
            children: node.children?.some(child => child.moocItemType === 0) ? (
                <Collapse
                    bordered={false}
                    style={panelStyle}
                    items={node.children?.map((child, childIndex) => processNode(child, childIndex)) || []}
                    onChange={onExpand}
                />
            ) : (
                <div className="space-y-2">
                    {node.children?.map((child, childIndex) => (
                        <Card key={child.key} size="small" className="bg-white flex gap-2">
                            <span>{child.key}</span>
                            <span>{child.title}</span>
                        </Card>
                    ))}
                </div>
            ),
        };
        return item;
    };

    return treeData.map((node, index) => processNode(node, index));
};

export default function MoocCatalogue() {
    const params = {
        id: 3
    }
    const { token } = theme.useToken();
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

    const panelStyle: React.CSSProperties = {
        marginBottom: 24,
        background: token.colorFillAlter,
        borderRadius: token.borderRadiusLG,
        border: 'none',
    };

    const { data: moocData, isLoading: isMoocLoading } = useMoocItem({
        moocId: params.id,
    });

    const { data: itemListData, isLoading: isItemListLoading } = useMoocItemList({
        params: {
            parentId: 0,
            moocId: params.id,
        },
        page: 1,
        pageSize: 10,
    });

    useEffect(() => {
        if (itemListData && !isItemListLoading) {
            const processedData = itemListData.rows?.map((item: any, index: number) => ({
                title: item.title,
                key: `${index + 1}`,
                nodeId: item.id,
                moocItemType: item.moocItemType,
                objectName: item.objectName,
                parentId: item.parentId,
                isLeaf: item.moocItemType !== 0,
                children: []
            })) || [];
            setTreeData(processedData);
        }
    }, [itemListData, isItemListLoading]);

    const loadData = async (nodeKey: string) => {
        try {
            // 查找父节点的 nodeId
            const findParentNodeId = (nodes: TreeNode[]): number | null => {
                for (const node of nodes) {
                    if (node.key === nodeKey) {
                        return node.nodeId;
                    }
                    if (node.children) {
                        const found = findParentNodeId(node.children);
                        if (found) return found;
                    }
                }
                return null;
            };

            const parentNodeId = findParentNodeId(treeData);
            if (!parentNodeId) {
                console.error('未找到父节点');
                return;
            }

            const response = await getMoocItemList({
                parentId: parentNodeId,
                moocId: params.id,
                page: 1,
                pageSize: 10,
            });

            const childNodes = response.data.data?.rows?.map((item: any, index: number) => ({
                title: item.title,
                key: `${nodeKey}.${index + 1}`,
                nodeId: item.id,
                moocItemType: item.moocItemType,
                objectName: item.objectName,
                parentId: item.parentId,
                isLeaf: item.moocItemType !== 0,
                children: []
            })) || [];

            console.log(childNodes);

            setTreeData(prevData => {
                const updateNode = (nodes: TreeNode[]): TreeNode[] => {
                    return nodes.map(item => {
                        if (item.key === nodeKey) {
                            return {
                                ...item,
                                children: childNodes
                            };
                        }
                        if (item.children) {
                            return {
                                ...item,
                                children: updateNode(item.children)
                            };
                        }
                        return item;
                    });
                };
                return updateNode(prevData);
            });
        } catch (error) {
            console.error('加载子节点失败:', error);
        }
    };

    const handleExpand = (keys: string | string[]) => {
        console.log(keys)
        if (Array.isArray(keys)) {
            // 找出新展开的key（在keys中但不在expandedKeys中的key）
            const newKey = keys.find(key => !expandedKeys.includes(key));
            if (newKey) {
                loadData(newKey);
            }
            setExpandedKeys(keys);
        }
    };

    if (isMoocLoading || isItemListLoading) return <Loading />;

    return (
        <div className="flex flex-col h-full box-border overflow-hidden p-8">
            <Title text={moocData?.title as string} />
            <Card title="目录">
                <Collapse
                    bordered={false}
                    expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
                    style={{ background: token.colorBgContainer }}
                    items={getItems(panelStyle, treeData, handleExpand)}
                    expandIconPosition={"end"}
                    onChange={handleExpand}
                />
            </Card>
        </div>
    );
}
