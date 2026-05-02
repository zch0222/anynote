

import './fotter.scss'
import Link from "next/link";

const Footer = () => {

    return (
        <>
            <div className={'footer'}>
                <span className={'span-copy'}>&copy; 学习随记 &nbsp;&nbsp;</span>
                <span className={'span-copy'}>ICP备案号：</span>
                <Link target={'_blank'} href={'https://beian.miit.gov.cn/#/Integrated/index'}
                      style={{fontSize: 14, color: '#8a8f8d'}}>{process.env.NEXT_PUBLIC_ICP}</Link>
            </div>
        </>
    )
};

export default Footer