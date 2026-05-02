
import {Navbar, NavbarBrand, NavbarContent, NavbarItem, Link, Button, Image} from "@nextui-org/react";

export default function HomeHead() {
    return (
        <div>
            <Navbar>
                <NavbarBrand>
                    <Image
                        className="w-[35px] mr-2"
                        radius="none"
                        src="https://anynote.obs.cn-east-3.myhuaweicloud.com/anynote_%20Shanghai/assets/LOGO.png"
                        alt={"LOGO"}
                    />
                    <p className="text-xl font-bold text-inherit">学习随记</p>
                </NavbarBrand>
                <NavbarContent className="hidden sm:flex gap-4" justify="center">
                    <NavbarItem isActive>
                        <Link href="#">
                            Features
                        </Link>
                    </NavbarItem>
                    {/*<NavbarItem>*/}
                    {/*    <Link color="foreground" href="#">*/}
                    {/*        Integrations*/}
                    {/*    </Link>*/}
                    {/*</NavbarItem>*/}
                </NavbarContent>
                <NavbarContent justify="end">
                    <NavbarItem>
                        <Button className="text-white" as={Link} color="primary" href="/login">
                            登录
                        </Button>
                    </NavbarItem>
                </NavbarContent>
            </Navbar>

        </div>
    )
}
