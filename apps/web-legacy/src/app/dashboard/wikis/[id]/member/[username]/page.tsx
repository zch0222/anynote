'use client'

import { useState } from "react";

import usePublicUserInfo from "@/hooks/usePublicUserInfo";
import withThemeConfigProvider from "@/components/hoc/withThemeConfigProvider";
import Loading from "@/components/Loading";
import UserInfoForm from "@/components/UserInfoForm";
import Title from "@/components/Title";
import {Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader} from "@nextui-org/react";
import { useSelector } from "react-redux";
import {RootState} from "@/store";
import { ROLE } from "@/constants/role";
import { useDispatch } from "react-redux";
import { showMessage } from "@/store/message/messageSlice";
import {resetPassword as fetchResetPassword} from "@/requests/client/system/user";
import {removeKnowledgeBaseUser} from "@/requests/client/note/knowledgeBase";
import { useRouter } from "next/navigation";

function KnowledgeBaseMember({ params }: {
    params: {
        id: number,
        username: string
    }
}) {

    const [newPassword, setNewPassword] = useState<string>("")
    const [repeatPassword, setRepeatPassword] = useState<string>("")
    const [isResetting, setIsResetting] = useState<boolean>(false)
    const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)
    const [isRemoving, setIsRemoving] = useState(false)

    const router = useRouter()
    const dispatch = useDispatch()
    const user = useSelector((state: RootState) => state.user)
    const { id, username } = params
    const { data } = usePublicUserInfo(username)


    if (!data) {
        return (
            <Loading/>
        )
    }

    const resetPassword = () => {
        if (newPassword !== repeatPassword) {
            dispatch(showMessage({
                type: "warning",
                content: "两次密码不同"
            }))
            return
        }
        if (newPassword.length < 6 || newPassword.length > 15) {
            dispatch(showMessage({
                type: "warning",
                content: "密码的长度必须在6~15位"
            }))
            return;
        }
        setIsResetting(true)
        fetchResetPassword({
            userId: data.id,
            newPassword: newPassword
        }).then(
            res => {
                dispatch(showMessage({
                    type: "success",
                    content: "重置密码成功"
                }))
            }
        ).catch(
            e => console.log(e)
        ).finally(
            () => {
                setIsResetting(false)
            }
        )

    }

    return (
        <>
            <div className="flex flex-col w-full h-full overflow-y-auto p-2">
                <div className="mt-5 ml-2">
                    <Title text="成员信息"/>
                </div>
                <UserInfoForm
                    data={data}
                />
                {user.role === ROLE.TEACHER ?
                    (
                        <div className="ml-10 mt-5 mb-2">
                            <div className="font-bold text-xl">
                                重置用户密码
                            </div>
                            <Input
                                type="password"
                                label="新密码"
                                variant="underlined"
                                onValueChange={(value: string) => setNewPassword(value)}
                            />
                            <Input
                                type="password"
                                label="重复密码"
                                variant="underlined"
                                onValueChange={(value: string) => setRepeatPassword(value)}
                            />
                            <div className="mt-1">
                                <Button
                                    className="text-white"
                                    color="primary"
                                    isLoading={isResetting}
                                    onPress={() => resetPassword()}
                                >
                                    重置密码
                                </Button>
                            </div>
                        </div>
                    ) : <></>
                }
                <div className="ml-10">
                    <Button
                        className="text-white"
                        color="danger"
                        onPress={() => setIsRemoveModalOpen(true)}
                    >
                        移出知识库
                    </Button>
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
                                            userId: data?.id,
                                            knowledgeBaseId: id
                                        }).then(
                                            res => {
                                                dispatch(showMessage({
                                                    type: "success",
                                                    content: "移除成功"
                                                }))
                                                onClose()
                                                router.back()
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

export default withThemeConfigProvider(KnowledgeBaseMember)