import { useState, useEffect } from 'react';

const useIsMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

    useEffect(() => {
        if (window === undefined) {
            return
        }
        const checkResize = () => {
            setIsMobile(window.innerWidth < breakpoint)
        };
        window.addEventListener('resize', checkResize);
        return () => window.removeEventListener('resize', checkResize);
    }, [breakpoint]);

    return isMobile;
};

export default useIsMobile;
