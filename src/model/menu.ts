export interface MenuNode {
    id: number;
    label: string;
    visible: boolean;
    enabled: boolean;
    type: 'standard' | 'separator';
    toggleType: 'checkmark' | 'radio' | null;
    toggleState: -1 | 0 | 1;
    iconName: string | null;
    children: MenuNode[];
}
