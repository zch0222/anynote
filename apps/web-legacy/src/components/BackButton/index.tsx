import {Button} from "@nextui-org/react";
import Back from "@/components/svg/Back";

export default function BackButton({ onClick, size }: {
    onClick: () => void,
    size: number
}) {
    return (
        <div>
            <Button
                isIconOnly
                aria-label="back"
                onClick={onClick}
                variant="light"
                className={"p-1"}
            >
                <Back width={size} height={size}/>
            </Button>
        </div>
    )
}
