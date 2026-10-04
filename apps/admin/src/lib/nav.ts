import type { Permission } from '@roms/contracts/permissions';
import {
	LayoutDashboard,
	ShoppingCart,
	ReceiptText,
	CookingPot,
	Armchair,
	BookOpen,
	Boxes,
	Truck,
	FlaskConical,
	Users,
	Bike,
	IdCard,
	Scale,
	ChartNoAxesColumn,
	Settings,
	ShieldCheck,
	Tag
} from '@lucide/svelte';

/** A nav entry. `perm` is any-of: holding any one is enough to see the item. */
export type NavItem = {
	label: string;
	href: string;
	icon: typeof LayoutDashboard;
	perm?: Permission[];
	/** short hint shown in the collapsed rail tooltip and the command palette */
	hint?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * The whole product, grouped the way a restaurant is organised: the service
 * happens on the floor, the money happens in the back office.
 */
export const NAV: NavGroup[] = [
	{
		label: 'Service',
		items: [
			{
				label: 'Dashboard',
				href: '/dashboard',
				icon: LayoutDashboard,
				hint: "Today's takings and what needs attention"
			},
			{
				label: 'POS',
				href: '/pos',
				icon: ShoppingCart,
				perm: ['orders.create'],
				hint: 'Charge a customer'
			},
			{
				label: 'Orders',
				href: '/orders',
				icon: ReceiptText,
				perm: ['orders.read'],
				hint: 'Every ticket'
			},
			{
				label: 'Kitchen',
				href: '/kitchen',
				icon: CookingPot,
				perm: ['kitchen.read'],
				hint: 'The pass'
			},
			{
				label: 'Tables',
				href: '/tables',
				icon: Armchair,
				perm: ['tables.read'],
				hint: 'The floor'
			},
			{
				label: 'Delivery',
				href: '/delivery',
				icon: Bike,
				perm: ['orders.read'],
				hint: 'Riders and dispatch'
			}
		]
	},
	{
		label: 'Stock',
		items: [
			{
				label: 'Catalog',
				href: '/catalog',
				icon: BookOpen,
				perm: ['products.read'],
				hint: 'Products, categories, modifiers'
			},
			{
				label: 'Inventory',
				href: '/inventory',
				icon: Boxes,
				perm: ['inventory.read'],
				hint: 'Levels and movements'
			},
			{
				label: 'Purchasing',
				href: '/purchasing',
				icon: Truck,
				perm: ['purchases.read'],
				hint: 'Suppliers and goods in'
			},
			{
				label: 'Promotions',
				href: '/promotions',
				icon: Tag,
				perm: ['categories.read'],
				hint: 'Discounts and codes'
			},
			{
				label: 'Recipes',
				href: '/recipes',
				icon: FlaskConical,
				perm: ['products.read'],
				hint: 'Costing and production'
			}
		]
	},
	{
		label: 'Back office',
		items: [
			{
				label: 'Customers',
				href: '/customers',
				icon: Users,
				perm: ['customers.read'],
				hint: 'Profiles and loyalty'
			},
			{
				label: 'Staff',
				href: '/staff',
				icon: IdCard,
				perm: ['staff.read'],
				hint: 'Shifts, attendance, advances'
			},
			{
				label: 'Accounting',
				href: '/accounting',
				icon: Scale,
				perm: ['accounting.read'],
				hint: 'Journal, expenses, closing'
			},
			{
				label: 'Reports',
				href: '/reports',
				icon: ChartNoAxesColumn,
				perm: ['reports.read'],
				hint: 'Sales, tax, valuation'
			}
		]
	},
	{
		label: 'System',
		items: [
			{
				label: 'Settings',
				href: '/settings',
				icon: Settings,
				perm: ['settings.read'],
				hint: 'Tenant, branches, tax, receipt'
			},
			{
				label: 'Administration',
				href: '/admin',
				icon: ShieldCheck,
				perm: ['tenants.manage', 'audit.read'],
				hint: 'Users, roles, audit'
			}
		]
	}
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((group) => group.items);

export const findNav = (pathname: string): NavItem | undefined =>
	NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
