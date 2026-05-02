"use client"

import React, {useEffect, useState} from 'react';
import type {MenuProps} from 'antd';
import {Button, Divider, Dropdown, Form, Input, Modal, Radio, Space, Tree} from 'antd';
import {MoreOutlined, PlusOutlined, SaveOutlined} from '@ant-design/icons';
import dynamic from 'next/dynamic';
import '@wangeditor/editor/dist/css/style.css';
import ContentEditor from "@/components/mooc/ContentEditor";
import {createMoocItem, getMoocItemInfoById, getMoocItemList, updateMoocItem} from "@/requests/client/note/mooc";
import {useDispatch} from "react-redux";
import {showMessage} from "@/store/message/messageSlice";
import useMoocItemList from "@/hooks/mooc/useMoocItemList";
import Loading from "@/components/Loading";
import useMoocItem from "@/hooks/mooc/useMoocItem";
import VideoUpload from "@/components/mooc/VideoUpload";
import VideoPlayer from "@/components/VideoPlayer";

interface TreeNode {
    title: string;
    key: string;
    children?: TreeNode[];
    /**
     * 项目文本
     */
    itemText?: string;
    /**
     * 慕课类型对象 0.章节 1.视频 2.文档
     */
    moocItemType?: number;
    /**
     * 文件对象名称
     */
    objectName?: string;
    /**
     * 父Item id，如果为0表示没有父节点
     */
    parentId?: number;
    isLeaf?: boolean;
    /**
     * 是否为新创建的节点
     */
    isNew?: boolean;
}

// 动态导入富文本编辑器，避免SSR问题
const Editor = dynamic(() => import('@wangeditor/editor-for-react').then(mod => mod.Editor), {ssr: false});

const CourseDirectory = ({params}: {
    params: {
        id: number
    }
}) => {
    const [form] = Form.useForm();
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [editingKey, setEditingKey] = useState<string>('');
    const [editingValue, setEditingValue] = useState<string>('');
    const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalType, setModalType] = useState<'same' | 'sub'>('same');
    const [isDataProcessing, setIsDataProcessing] = useState(true);
    const [currentParentId, setCurrentParentId] = useState<number>(0);
    const dispatch = useDispatch();

    const {data: moocData, isLoading: isMoocLoading} = useMoocItem({
        moocId: params.id,
    });

    const {data, isLoading} = useMoocItemList({
        params: {
            parentId: 0,
            moocId: params.id,
        },
        page: 1,
        pageSize: 10,
    });

    // 处理获取到的数据
    useEffect(() => {
        if (data && !isLoading) {
            setIsDataProcessing(true);
            try {
                // 这里进行数据处理
                const processedData = data.rows?.map((item: any) => ({
                    title: item.title,
                    key: item.id.toString(),
                    moocItemType: item.moocItemType,
                    objectName: item.objectName,
                    parentId: item.parentId,
                    children: []
                })) || [];

                setTreeData(processedData);

            } catch (error) {
                console.error('数据处理错误:', error);
                dispatch(showMessage({
                    type: "error",
                    content: "数据处理失败"
                }));
            } finally {
                setIsDataProcessing(false);
            }
        }
    }, [data, dispatch, isLoading]);

    // 获取节点内容
    useEffect(() => {
        const currentNode = findNode(selectedKeys[0], treeData);
        console.log(currentNode)
        if (currentNode && !currentNode.isNew) {
            getMoocItemInfoById({
                moocId: params.id,
                moocItemId: Number(currentNode.key),
            }).then(res => {
                const data = res.data.data;
                if (currentNode.moocItemType === 2 && data?.moocItemText?.itemText) {
                    setTreeData(prevData =>
                        updateNode(prevData, selectedKeys[0], node => ({
                            ...node,
                            itemText: data.moocItemText.itemText
                        }))
                    );
                } else if (currentNode.moocItemType === 1 && data?.objectName) {
                    setTreeData(prevData =>
                        updateNode(prevData, selectedKeys[0], node => ({
                            ...node,
                            objectName: data.objectName
                        }))
                    );
                }
            });
        }
    }, [selectedKeys]);

    // 如果数据正在加载或处理中，显示加载状态
    if (isLoading || isDataProcessing || isMoocLoading) {
        return <Loading/>;
    }

    // 获取节点层级
    const getNodeLevel = (nodeKey: string, nodes: TreeNode[], level: number = 1): number => {
        for (const node of nodes) {
            if (node.key === nodeKey) {
                return level;
            }
            if (node.children) {
                const childLevel = getNodeLevel(nodeKey, node.children, level + 1);
                if (childLevel > 0) {
                    return childLevel;
                }
            }
        }
        return 0;
    };

    // 获取父节点
    const getParentNode = (nodeKey: string, nodes: TreeNode[]): TreeNode | null => {
        for (const node of nodes) {
            if (node.children) {
                for (const child of node.children) {
                    if (child.key === nodeKey) {
                        return node;
                    }
                }
                const found = getParentNode(nodeKey, node.children);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    };

    // 递归查找节点
    function findNode(nodeKey: string, nodes: TreeNode[]): TreeNode | null {
        for (const node of nodes) {
            if (node.key === nodeKey) {
                return node;
            }
            if (node.children) {
                const found = findNode(nodeKey, node.children);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    };

    // 递归更新节点
    const updateNode = (nodes: TreeNode[], nodeKey: string, updateFn: (node: TreeNode) => TreeNode): TreeNode[] => {
        return nodes.map(item => {
            if (item.key === nodeKey) {
                return updateFn(item);
            }
            if (item.children) {
                return {
                    ...item,
                    children: updateNode(item.children, nodeKey, updateFn)
                };
            }
            return item;
        });
    };

    // 添加同级目录
    const handleAddSameLevel = () => {
        setModalType('same');
        setIsModalVisible(true);
        form.setFieldsValue({title: '新建课程节点'});
    };

    // 添加子目录
    const handleAddSubLevel = () => {
        if (!selectedKeys.length) {
            dispatch(showMessage({
                type: "warning",
                content: "请先选择一个目录"
            }))
            return;
        }

        const currentNode = findNode(selectedKeys[0], treeData);
        if (!currentNode) return;

        // 检查当前节点是否为目录节点
        if (currentNode.moocItemType !== 0) {
            dispatch(showMessage({
                type: "error",
                content: "只有目录节点可以添加子节点"
            }))
            return;
        }

        const currentLevel = getNodeLevel(selectedKeys[0], treeData);
        if (currentLevel >= 3) {
            dispatch(showMessage({
                type: "error",
                content: "最多只能创建三级子目录"
            }))
            return;
        }

        setModalType('sub');
        setIsModalVisible(true);
        form.setFieldsValue({title: '新建课程节点'});
    };

    // 确认添加目录
    const handleModalOk = () => {
        form.validateFields().then(values => {
            const newNode: TreeNode = {
                title: values.title || '新建课程目录',
                key: Date.now().toString(),
                children: [],
                itemText: '',
                moocItemType: -1, // 默认无章节类型
                objectName: '',
                parentId: 0, // 默认为顶级节点
                isLeaf: true, // 新建节点默认为叶子节点
                isNew: true // 设置为新创建的节点
            };

            let parentKey: string | null = null;

            console.log(selectedKeys.length)
            if (modalType === 'same') {
                // 如果没有选中节点，则添加到根级目录
                if (!selectedKeys.length) {
                    newNode.moocItemType = 0
                    newNode.parentId = 0; // 根节点
                    setTreeData([...treeData, newNode]);
                } else {
                    // 查找选中节点的父节点
                    const parentNode = getParentNode(selectedKeys[0], treeData);
                    console.log("parentNode", parentNode);
                    const newTreeData = [...treeData];

                    if (parentNode) {
                        // 如果有父节点，在父节点的children中添加
                        parentKey = parentNode.key;
                        newNode.parentId = Number(parentKey);
                        // 设置父节点的isLeaf为false
                        const updateParentNode = (nodes: TreeNode[]) => {
                            for (let node of nodes) {
                                if (node.key === parentNode.key) {
                                    node.isLeaf = false;
                                    node.children = node.children || [];
                                    node.children.push(newNode);
                                    break;
                                }
                                if (node.children) {
                                    updateParentNode(node.children);
                                }
                            }
                        };
                        updateParentNode(newTreeData);
                    } else {
                        // 如果没有父节点（选中的是顶层节点），则添加到根级目录
                        newNode.parentId = 0; // 根节点
                        newTreeData.push(newNode);
                    }
                    setTreeData(newTreeData);
                }
            } else {
                // 添加子目录
                parentKey = selectedKeys[0];
                // 设置父节点ID为当前选中节点的key
                newNode.parentId = Number(parentKey);
                const newTreeData = [...treeData];
                const addChildToNode = (nodes: TreeNode[]) => {
                    for (let node of nodes) {
                        if (node.key === selectedKeys[0]) {
                            // 设置父节点的isLeaf为false
                            node.isLeaf = false;
                            // 设置父节点的moocItemType为0（目录节点）
                            node.moocItemType = 0;
                            node.children = node.children || [];
                            node.children.push(newNode);
                            break;
                        }
                        if (node.children) {
                            addChildToNode(node.children);
                        }
                    }
                };
                addChildToNode(newTreeData);
                setTreeData(newTreeData);
            }

            // 选中新建的节点
            setSelectedKeys([newNode.key]);

            // 确保父节点展开
            if (parentKey) {
                setExpandedKeys(prevKeys => {
                    const newKeys = new Set([...prevKeys, parentKey!]);
                    return Array.from(newKeys);
                });
            }

            form.resetFields();
            setIsModalVisible(false);
        });
    };

    // 保存处理
    const handleSave = () => {
        const currentNode = findNode(selectedKeys[0], treeData);
        if (currentNode !== null) {
            // 基础数据结构
            const baseData = {
                moocId: Number(params.id),
                knowledgeBaseId: moocData?.knowledgeBaseId as number,
                items: [
                    {
                        title: currentNode.title,
                        moocItemType: currentNode.moocItemType,
                        parentId: currentNode.parentId,
                        objectName: undefined as string | undefined,
                        itemText: undefined as string | undefined
                    }
                ]
            };

            // 根据节点类型进行不同处理
            switch (currentNode.moocItemType) {
                case 0: // 目录节点
                    // 目录节点不需要额外处理
                    break;
                case 1: // 视频节点
                    if (!currentNode.objectName) {
                        dispatch(showMessage({
                            type: "error",
                            content: "请先上传视频文件"
                        }));
                        return;
                    }
                    baseData.items[0].objectName = currentNode.objectName;
                    break;
                case 2: // 文档节点
                    if (!currentNode.itemText) {
                        dispatch(showMessage({
                            type: "error",
                            content: "请先编辑文档内容"
                        }));
                        return;
                    }
                    baseData.items[0].itemText = currentNode.itemText;
                    break;
                default:
                    dispatch(showMessage({
                        type: "error",
                        content: "请先选择节点类型"
                    }));
                    return;
            }

            // 如果是新创建的节点，需要创建
            if (currentNode.isNew) {
                createMoocItem(baseData).then(res => {
                    console.log(res);
                    // 更新节点，移除 isNew 标记
                    setTreeData(prevData =>
                        updateNode(prevData, currentNode.key, node => ({
                            ...node,
                            isNew: false
                        }))
                    );

                    // 获取父节点并重新加载数据
                    const parentNode = getParentNode(currentNode.key, treeData);
                    if (parentNode) {
                        loadData(parentNode, true);
                    } else {
                        // 如果没有父节点，重新加载根目录数据
                        getMoocItemList({
                            parentId: 0,
                            moocId: params.id,
                            page: 1,
                            pageSize: 10,
                        }).then(response => {
                            const processedData = response.data.data?.rows?.map((item: any) => ({
                                title: item.title,
                                key: item.id.toString(),
                                moocItemType: item.moocItemType,
                                objectName: item.objectName,
                                parentId: item.parentId,
                                children: []
                            })) || [];

                            setTreeData(processedData);
                        }).catch(error => {
                            console.error('加载根目录数据失败:', error);
                            dispatch(showMessage({
                                type: "error",
                                content: "加载根目录数据失败"
                            }));
                        });
                    }

                    dispatch(showMessage({
                        type: "success",
                        content: "保存成功"
                    }));
                }).catch(error => {
                    console.error('保存失败:', error);
                    dispatch(showMessage({
                        type: "error",
                        content: "保存失败"
                    }));
                });
            } else {
                const data = {
                    moocId: Number(params.id),
                    knowledgeBaseId: moocData?.knowledgeBaseId as number,
                    title: currentNode.title,
                    parentId: currentNode.parentId,
                    itemText: currentNode.itemText,
                    objectName: currentNode.objectName,
                }
                updateMoocItem(Number(currentNode.key), data).then((res: any) => {
                    console.log(res);
                    dispatch(showMessage({
                        type: "success",
                        content: "更新成功"
                    }));
                }).catch(error => {
                    console.log(error);
                })
            }
        } else {
            dispatch(showMessage({
                type: "info",
                content: "请先选择节点"
            }));
        }
    };

    // 预览处理
    const handlePreview = () => {
        dispatch(showMessage({
            type: "info",
            content: "预览功能开发中"
        }))
        // message.info('预览功能开发中');
    };

    // 完成处理
    const handleComplete = () => {
        dispatch(showMessage({
            type: "success",
            content: "文档已完成"
        }))
        // message.success('文档已完成');
    };

    // 树节点操作
    const onSelect = (keys: any) => {
        setSelectedKeys(keys);
        if (keys.length > 0) {
            // 将选中节点的 key 转换为 number 类型作为新的 parentId
            setCurrentParentId(Number(keys[0]));

            // 获取当前选中节点
            const currentNode = findNode(keys[0], treeData);
            if (currentNode && currentNode.moocItemType === 0) {
                // 如果是目录节点，则展开该节点
                setExpandedKeys(prevKeys => {
                    const newKeys = new Set([...prevKeys, keys[0]]);
                    return Array.from(newKeys);
                });
            }
        } else {
            setCurrentParentId(0);
        }
    };

    // 处理展开/收起
    const onExpand = (expandedKeys: React.Key[]) => {
        setExpandedKeys(expandedKeys.map(key => key.toString()));
    };

    // 更多菜单选项
    const moreMenuItems: MenuProps['items'] = [
        {
            key: 'rename',
            label: '重命名'
        },
        {
            key: 'delete',
            label: '删除',
            danger: true
        }
    ];

    // 处理更多菜单点击
    const handleMoreMenuClick = ({key}: { key: string }, node: TreeNode) => {
        switch (key) {
            case 'rename':
                setEditingKey(node.key);
                setEditingValue(node.title);
                break;
            case 'delete':
                // 删除节点
                const deleteNode = (nodes: TreeNode[]): TreeNode[] => {
                    return nodes.filter(item => {
                        if (item.key === node.key) {
                            return false;
                        }
                        if (item.children) {
                            item.children = deleteNode(item.children);
                        }
                        return true;
                    });
                };
                setTreeData(deleteNode([...treeData]));
                dispatch(showMessage({
                    type: "success",
                    content: "删除成功"
                }))
                // message.success('删除成功');
                break;
        }
    };

    // 处理重命名确认
    const handleRename = (node: TreeNode) => {
        if (!editingValue.trim()) {
            dispatch(showMessage({
                type: "error",
                content: "名称不能为空"
            }))
            // message.error('名称不能为空');
            return;
        }

        const updateNodeTitle = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map(item => {
                if (item.key === node.key) {
                    return {
                        ...item,
                        title: editingValue,
                    };
                }
                if (item.children) {
                    return {...item, children: updateNodeTitle(item.children)};
                }
                return item;
            });
        };

        setTreeData(updateNodeTitle([...treeData]));
        setEditingKey('');
        dispatch(showMessage({
            type: "success",
            content: "重命名成功"
        }))
        // message.success('重命名成功');
    };

    // 自定义节点渲染
    const titleRender = (node: TreeNode) => (
        <div
            style={{display: 'flex', alignItems: 'center', gap: '8px'}}
            onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingKey(node.key);
                setEditingValue(node.title);
            }}
        >
            {editingKey === node.key ? (
                <Input
                    size="small"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onPressEnter={() => handleRename(node)}
                    onBlur={() => handleRename(node)}
                    autoFocus
                    style={{width: 'calc(100% - 32px)'}}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span>{node.title}</span>
            )}
            <Dropdown
                menu={{
                    items: moreMenuItems,
                    onClick: (info) => handleMoreMenuClick(info, node)
                }}
                trigger={['click']}
            >
                <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined/>}
                    onClick={(e) => e.stopPropagation()}
                />
            </Dropdown>
        </div>
    );

    // 加载子节点数据
    const loadData = (node: TreeNode, isActive: boolean = false): Promise<void> => {
        console.log(node)
        return new Promise(async (resolve) => {
            // 如果节点已经有子节点，直接返回
            if (node.children && node.children.length > 0 && !isActive) {
                resolve();
                return;
            }

            try {
                const response = await getMoocItemList({
                    parentId: Number(node.key),
                    moocId: params.id,
                    page: 1,
                    pageSize: 10,
                });

                const childNodes = response.data.data?.rows?.map((item: any) => ({
                    title: item.title,
                    key: item.id.toString(),
                    moocItemType: item.moocItemType,
                    objectName: item.objectName,
                    parentId: item.parentId,
                    isLeaf: item.moocItemType !== 0,
                    isNew: false,
                    children: []
                })) || []; // 对数据进行倒置排序

                setTreeData(prevData =>
                    updateNode(prevData, node.key, currentNode => ({
                        ...currentNode,
                        children: childNodes
                    }))
                );

                resolve();
            } catch (error) {
                console.error('加载子节点失败:', error);
                dispatch(showMessage({
                    type: "error",
                    content: "加载子节点失败"
                }));
                resolve();
            }
        });
    };

    return (
        <div className="flex flex-col h-screen">
            {/* 主要内容区域 */}
            <div className="flex h-screen">
                {/* 左侧目录树 */}
                <div className="flex flex-col w-60 border-r border-gray-200 p-2 gap-[10px]">
                    <Space className={"flex justify-center items-center"}>
                        <Button icon={<PlusOutlined/>} onClick={handleAddSameLevel}>同级节点</Button>
                        <Button icon={<PlusOutlined/>} onClick={handleAddSubLevel}>子节点</Button>
                    </Space>
                    <Tree
                        // showLine
                        // multiple
                        onSelect={onSelect}
                        onExpand={onExpand}
                        expandedKeys={expandedKeys}
                        selectedKeys={selectedKeys}
                        treeData={treeData}
                        titleRender={titleRender}
                        loadData={loadData}
                    />
                </div>

                {/* 右侧编辑区域 */}
                <div className="flex-1 p-4">
                    <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-medium">
                                    {findNode(selectedKeys[0], treeData)?.title || '新建课程目录'}
                                </h2>
                                {getParentNode(selectedKeys[0], treeData) !== null && (
                                    <Radio.Group
                                        buttonStyle="solid"
                                        value={findNode(selectedKeys[0], treeData)?.moocItemType}
                                        onChange={(e) => {
                                            setTreeData(prevData =>
                                                updateNode(prevData, selectedKeys[0], node => ({
                                                    ...node,
                                                    moocItemType: e.target.value
                                                }))
                                            );
                                        }}
                                    >
                                        <Radio.Button
                                            value={0}
                                            disabled={findNode(selectedKeys[0], treeData)?.moocItemType !== -1 && findNode(selectedKeys[0], treeData)?.moocItemType !== 0}
                                        >
                                            目录节点
                                        </Radio.Button>
                                        <Radio.Button
                                            value={1}
                                            disabled={findNode(selectedKeys[0], treeData)?.moocItemType !== -1 && findNode(selectedKeys[0], treeData)?.moocItemType !== 1}
                                        >
                                            视频节点
                                        </Radio.Button>
                                        <Radio.Button
                                            value={2}
                                            disabled={findNode(selectedKeys[0], treeData)?.moocItemType !== -1 && findNode(selectedKeys[0], treeData)?.moocItemType !== 2}
                                        >
                                            文档节点
                                        </Radio.Button>
                                    </Radio.Group>
                                )}
                            </div>
                            <Space>
                                {/*<Button icon={<UndoOutlined/>}>撤销</Button>*/}
                                {/*<Button icon={<RedoOutlined/>}>恢复</Button>*/}
                                <Button type={"primary"} icon={<SaveOutlined/>} onClick={handleSave}>保存</Button>
                                {/*<Button icon={<EyeOutlined/>} onClick={handlePreview}>预览</Button>*/}
                                {/*<Button type="primary" icon={<CheckOutlined/>}*/}
                                {/*        onClick={handleComplete}>完成</Button>*/}
                            </Space>
                        </div>
                        <Divider className="my-4"/>
                        <div className="flex-1">
                            {(() => {
                                const currentNode = findNode(selectedKeys[0], treeData);
                                if (!currentNode) return null;

                                switch (currentNode.moocItemType) {
                                    case 0:
                                        return (
                                            <div className="flex items-center justify-center h-full text-gray-500">
                                                目录节点不可编辑
                                            </div>
                                        );
                                    case 1: // 视频节点
                                        return (
                                            <>
                                                {currentNode.objectName !== "" ?
                                                    <VideoPlayer name={currentNode.objectName as string}/> :
                                                    <VideoUpload moocId={params.id} setVideoName={(value) => {
                                                        console.log(value)
                                                        setTreeData(prevData =>
                                                            updateNode(prevData, selectedKeys[0], node => ({
                                                                ...node,
                                                                objectName: value
                                                            }))
                                                        );
                                                    }}/>}
                                            </>
                                        );
                                    case 2: // 文档节点
                                        return (
                                            <div className="h-full">
                                                <ContentEditor
                                                    onInput={(value) => {
                                                        console.log(value)
                                                        setTreeData(prevData =>
                                                            updateNode(prevData, selectedKeys[0], node => ({
                                                                ...node,
                                                                itemText: value
                                                            }))
                                                        );
                                                    }}
                                                    content={currentNode.itemText}
                                                />
                                            </div>
                                        );
                                    default:
                                        return (
                                            <div
                                                className="min-h-[400px] flex items-center justify-center text-gray-500">
                                                请选择节点类型
                                            </div>
                                        );
                                }
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            {/* 添加目录弹窗 */}
            <Modal
                title={modalType === 'same' ? '添加同级节点' : '添加子节点'}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => setIsModalVisible(false)}
                okText={"确认"}
            >
                <Form form={form}>
                    <Form.Item
                        name="title"
                        label="节点名称"
                        rules={[{required: true, message: '请输入节点名称'}]}
                    >
                        <Input placeholder="请输入节点名称"/>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CourseDirectory;
