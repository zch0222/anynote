'use client'
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import createPage from "@/components/hoc/createPage/createPage";
import Pagination from "@/components/Pagination";
import useKnowledgeBaseMemberList from "@/hooks/useKnowledgeBaseMemberList";
import {InboxOutlined, MoreOutlined} from '@ant-design/icons';
import { importUsers } from "@/requests/client/note/knowledgeBase";
import {KnowledgeBaseMember} from "@/types/noteTypes";
import {UserOutlined} from "@ant-design/icons";
import {useTheme} from "next-themes";
import {useState, useRef, MutableRefObject, Ref, useCallback} from "react";
import {Button, Link, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input} from "@nextui-org/react";
import {Upload, Button as AntdButton, Popover} from "antd";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { showMessage } from "@/store/message/messageSlice";
import {RootState} from "@/store";
import {UploadChangeParam} from "antd/es/upload";
import {element} from "prop-types";
import {ResData} from "@/types/requestTypes";
import { ImportKnowledgeBaseUserVO } from "@/types/noteTypes";
import Loading from "@/components/Loading";
import { removeKnowledgeBaseUser } from "@/requests/client/note/knowledgeBase";
import {RED} from "@/constants/color";

const { Dragger } = Upload;

function WikiManageMemberTab({id}: {
    id: number
}) {
    const router = useRouter()

    const dispatch = useDispatch()

    const [username, setUsername] = useState("")
    const usernameRef = useRef<HTMLInputElement>(null)

    const [isImportUserResModalOpen, setIsImportUserResModalOpen] = useState<boolean>(false)
    const [importUserResModalValue, setImportUserResModal] = useState<{
        title: string
        data: ImportKnowledgeBaseUserVO | null
    }>({
        title: "导入完成",
        data: null
    })
    const user = useSelector((state: RootState) => state.user)
    const onImportChange = (info: UploadChangeParam) => {
        if (info.file.status === 'done' || info.file.status === "error") {
            console.log(info.file.response)
            if (info.file.response.code === "00000") {
                setImportUserResModal({
                    ...importUserResModalValue,
                    data: info.file.response.data
                })
                setIsImportUserResModalOpen(true)
            }
            else {
                console.log(1111)
                try {
                    dispatch(showMessage({
                        type: "error",
                        content: info.file.response.msg
                    }))
                } catch (e) {
                    console.log(e)
                    dispatch(showMessage({
                        type: "error",
                        content: "导入失败"
                    }))
                }
            }
        }
    }


    const MemberItem = ({ data }: {
        data: KnowledgeBaseMember
    }) => {
        const {theme} = useTheme()
        const [isHovered, setIsHovered] = useState(false);
        const [isRemoving, setIsRemoving] = useState(false)
        const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)
        const hoveredBg = 'light' === theme ? 'bg-[#FAFAFA]' :  'bg-[#262626]'

        const moreContent = (
            <div className="flex flex-col w-[120px] select-none">
                <div
                    className={`p-1 ${isHovered ? hoveredBg : ''} cursor-pointer`}
                    style={{
                        color: RED
                    }}
                    onClick={(e) => {
                        e.stopPropagation()
                        setIsRemoveModalOpen(true)
                    }}
                >
                    移除用户
                </div>
            </div>
        )


        return (
            <>
                <div
                    className={`w-full flex flex-row items-center justify-between cursor-pointer p-2 ${isHovered ? hoveredBg : ''}`}
                    onClick={() => router.push(`/dashboard/wikis/${id}/member/${data.username}`)}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <div className="flex flex-row items-center">
                        <div>
                            <UserOutlined
                                style={{
                                    fontSize: 30
                                }}
                            />
                        </div>
                        <div className="flex flex-col ml-2">
                            <div className="text-base font-bold">
                                {data.nickname}
                            </div>
                            <div className="text-sm text-gray-500">
                                {data.username}
                            </div>
                        </div>
                    </div>
                    <div
                        className="p-2"
                        onClick={(e) => {
                            e.stopPropagation()
                        }}
                    >
                        <Popover
                            content={moreContent}
                            trigger="click"
                            overlayStyle={{
                                padding: 0
                            }}
                        >
                            <MoreOutlined
                                style={{
                                    fontSize: 18
                                }}
                            />
                        </Popover>
                    </div>
                </div>

                <Modal
                    isOpen={isRemoveModalOpen}
                    onClose={() => setIsRemoveModalOpen(false)}
                >
                    <ModalContent>
                        {(onClose) => (
                            <>
                                <ModalHeader className="flex flex-col gap-1">移除用户</ModalHeader>
                                <ModalBody>
                                    确定移除用户吗？
                                </ModalBody>
                                <ModalFooter>
                                    <Button variant="light" onPress={onClose}>
                                        取消
                                    </Button>
                                    <Button
                                        isLoading={isRemoving}
                                        color="danger"
                                        onPress={() => {
                                            setIsRemoving(true)
                                            removeKnowledgeBaseUser({
                                                userId: data.userId,
                                                knowledgeBaseId: id
                                            }).then(
                                                res => {
                                                    dispatch(showMessage({
                                                        type: "success",
                                                        content: "移除成功"
                                                    }))
                                                    onClose()
                                                }
                                            ).catch(
                                                e => console.log(e)
                                            ).finally(() => {
                                                setIsRemoving(false)
                                            })
                                        }}
                                    >
                                        确定
                                    </Button>
                                </ModalFooter>
                            </>
                        )}
                    </ModalContent>
                </Modal>
            </>
        )
    }

    return (
        <div className="w-full h-full flex flex-col flex-grow overflow-y-auto">
            <div className="flex flex-col w-full pr-3 pb-[50px]">
                <Button
                    className="text-white mr-2 w-[120px] mb-2"
                    color="primary"
                    href="https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/knowledge_base/files/import_user_template.xls"
                    as={Link}
                    size="sm"
                >
                    下载导入模板
                </Button>
                <Dragger
                    multiple={false}
                    maxCount={1}
                    name="users"
                    action={`${process.env.NEXT_PUBLIC_BASE_URL}/api/note/manage/bases/import`}
                    headers={{
                        accessToken: user.token?.accessToken || ""
                    }}
                    progress={{
                        format: (percent) => percent && `${parseFloat(percent.toFixed(2))}%`
                    }}
                    data={{
                        knowledgeBaseId: id
                    }}
                    onChange={onImportChange}
                >
                    <InboxOutlined
                        style={{
                            fontSize: 50
                        }}
                    />
                    <div className="text-base">点击或拖拽表格到此区域导入用户</div>
                    <div className="text-sm text-gray-500">点击上方按钮下载导入模版</div>
                    {/*<AntdButton>*/}
                    {/*    导入用户*/}
                    {/*</AntdButton>*/}
                </Dragger>
            </div>
            <div>
                <form
                    className="flex flex-row items-center"
                    onSubmit={(e) => {
                        e.preventDefault()
                        setUsername(usernameRef.current?.value || "")
                    }}
                >
                    <Input name="username" className="w-[200px] mr-2" size="sm" placeholder="用户名" ref={usernameRef}/>
                    <Button color="primary" type="submit">搜索</Button>
                </form>
            </div>
            <div className="flex-grow overflow-hidden pb-10">
                <Pagination
                    Page={createPage(MemberItem)}
                    swr={useKnowledgeBaseMemberList}
                    params={{
                        knowledgeBaseId: id,
                        username: username
                    }}
                    direction={'col'}
                    isShowTotal={true}
                />
            </div>
            <Modal
                isOpen={isImportUserResModalOpen}
                onClose={() => {
                    console.log(111)
                    setImportUserResModal({
                        ...importUserResModalValue,
                        data: null
                    })
                    setIsImportUserResModalOpen(false)
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader>
                                {importUserResModalValue.title}
                            </ModalHeader>
                            <ModalBody>
                                {
                                    importUserResModalValue.data === null ? <Loading/> :
                                        <div className="flex flex-col">
                                            <div className="flex flex-col">
                                                <div className="text-base text-red-600 mb-2">
                                                    {`导入失败用户数量: ${importUserResModalValue.data.failCount}`}
                                                </div>
                                                <div className="text-base font-bold">导入失败用户:</div>
                                                {importUserResModalValue.data.failUserList.map((item, index) => (
                                                    <div
                                                        className="pt-1"
                                                        key={index.toString()}
                                                    >
                                                        {`${item.username}  ${item.reason}`}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                }
                            </ModalBody>
                            <ModalFooter>
                                <Button
                                    onPress={onClose}
                                >
                                    关闭
                                </Button>
                                <Button
                                    color="primary"
                                    href={importUserResModalValue.data?.excelUrl}
                                    as={Link}
                                >
                                    下载用户信息
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    )
}

export default withThemeConfigProvider(WikiManageMemberTab)