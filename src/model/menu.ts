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

// DBusMenu uses "_" for mnemonic markers and "__" for literal underscores.
export function decodeDBusMenuLabel(label: string): string {
    let decoded = '';
    for (let index = 0; index < label.length; index++) {
        const character = label[index]!;
        if (character !== '_') {
            decoded += character;
            continue;
        }
        if (label[index + 1] === '_') {
            decoded += '_';
            index++;
        }
    }
    return decoded;
}
